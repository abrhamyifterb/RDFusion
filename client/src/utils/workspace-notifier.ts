import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { LanguageClient } from 'vscode-languageclient/node';
import { scanWorkspace } from './workspace-find-files';

const SHACL_MARKERS = [
	'http://www.w3.org/ns/shacl#',
	'https://www.w3.org/ns/shacl#',
	'@prefix sh:',
	'prefix sh:',
	'"sh"',
	"'sh'",
	'sh:',
	'NodeShape',
	'PropertyShape',
	'targetClass',
	'targetNode',
	'targetObjectsOf',
	'targetSubjectsOf',
];

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const PROBE_BYTES = 64 * 1024;
const INDEX_BATCH_SIZE = 25;

export interface WorkspaceNotifyOptions {
	shaclOnly?: boolean;
	maxConcurrency?: number;
}

export interface WorkspaceIndexFileEntry {
	uri: string;
	version: number;
	size: number;
}

export interface WorkspaceIndexResult {
	scanned: number;
	candidates: number;
	indexed: number;
	failed: number;
	shapes: number;
	skippedLarge: number;
	skippedNonShacl: number;
}

export interface WorkspaceIndexProgress {
	phase: 'scanning' | 'probing' | 'indexing' | 'done';
	message: string;
	scanned?: number;
	candidates?: number;
	indexed?: number;
	failed?: number;
	shapes?: number;
}

async function statFile(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
	try {
		return await vscode.workspace.fs.stat(uri);
	} catch {
		return undefined;
	}
}

async function readProbe(uri: vscode.Uri): Promise<string> {
	if (uri.scheme !== 'file') {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(bytes).subarray(0, PROBE_BYTES).toString('utf8');
	}
	const handle = await fs.open(uri.fsPath, 'r');
	try {
		const buffer = Buffer.alloc(PROBE_BYTES);
		const result = await handle.read(buffer, 0, PROBE_BYTES, 0);
		return buffer.subarray(0, result.bytesRead).toString('utf8');
	} finally {
		await handle.close();
	}
}

async function looksLikeShaclFile(uri: vscode.Uri): Promise<boolean> {
	try {
		const probe = (await readProbe(uri)).toLowerCase();
		return SHACL_MARKERS.some(marker => probe.includes(marker.toLowerCase()));
	} catch {
		return false;
	}
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
	let index = 0;
	const results: R[] = [];
	const workerCount = Math.max(1, Math.min(limit, items.length || 1));
	const workers = Array.from({ length: workerCount }, async () => {
		while (index < items.length) {
			const current = index++;
			results[current] = await worker(items[current]);
		}
	});
	await Promise.all(workers);
	return results;
}

async function buildWorkspaceIndexEntries(
	files: vscode.Uri[],
	maxConcurrency: number,
	shaclOnly: boolean,
): Promise<{ entries: WorkspaceIndexFileEntry[]; skippedLarge: number; skippedNonShacl: number }> {
	let skippedLarge = 0;
	let skippedNonShacl = 0;
	const maybeEntries = await mapLimit(files, maxConcurrency, async (file) => {
		const stat = await statFile(file);
		if (!stat || stat.size > MAX_FILE_BYTES) {
			skippedLarge++;
			return undefined;
		}
		if (shaclOnly && !(await looksLikeShaclFile(file))) {
			skippedNonShacl++;
			return undefined;
		}
		return {
			uri: file.toString(),
			version: stat.mtime,
			size: stat.size,
		};
	});
	return {
		entries: maybeEntries.filter((entry): entry is WorkspaceIndexFileEntry => !!entry),
		skippedLarge,
		skippedNonShacl,
	};
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

function emptyResult(scanned = 0, skippedLarge = 0, skippedNonShacl = 0): WorkspaceIndexResult {
	return { scanned, candidates: 0, indexed: 0, failed: 0, shapes: 0, skippedLarge, skippedNonShacl };
}

async function indexFileUris(
	client: LanguageClient,
	files: vscode.Uri[],
	options: WorkspaceNotifyOptions = {},
	onProgress?: (progress: WorkspaceIndexProgress) => void,
	requestName?: string,
): Promise<WorkspaceIndexResult> {
	const shaclOnly = options.shaclOnly ?? true;
	const targetRequestName = requestName ?? (shaclOnly ? 'rdfusion/workspace/indexShaclFiles' : 'rdfusion/workspace/indexRdfFiles');
	const maxConcurrency = options.maxConcurrency ?? 4;
	const modeLabel = shaclOnly ? 'SHACL' : 'RDF';
	onProgress?.({ phase: 'probing', message: shaclOnly
		? `Checking ${files.length} RDF file(s) for SHACL content…`
		: `Checking ${files.length} RDF file(s) for workspace indexing…`, scanned: files.length });
	const { entries, skippedLarge, skippedNonShacl } = await buildWorkspaceIndexEntries(files, maxConcurrency, shaclOnly);
	if (entries.length === 0) {
		const result = emptyResult(files.length, skippedLarge, skippedNonShacl);
		onProgress?.({ phase: 'done', message: shaclOnly
			? `No SHACL candidates found in ${files.length} RDF file(s).`
			: `No RDF files eligible for indexing among ${files.length} candidate file(s).`, ...result });
		return result;
	}

	let total: WorkspaceIndexResult = {
		scanned: files.length,
		candidates: entries.length,
		indexed: 0,
		failed: 0,
		shapes: 0,
		skippedLarge,
		skippedNonShacl,
	};

	const batches = chunk(entries, INDEX_BATCH_SIZE);
	for (let i = 0; i < batches.length; i++) {
		onProgress?.({ phase: 'indexing', message: `Indexing ${modeLabel} batch ${i + 1}/${batches.length} (${batches[i].length} file(s))…`, ...total });
		const result = await client.sendRequest<Partial<WorkspaceIndexResult>>(targetRequestName, {
			files: batches[i],
			final: i === batches.length - 1,
		});
		total = {
			...total,
			indexed: total.indexed + (result?.indexed ?? 0),
			failed: total.failed + (result?.failed ?? 0),
			shapes: result?.shapes ?? total.shapes,
		};
	}

	onProgress?.({ phase: 'done', message: shaclOnly
		? `Indexed ${total.indexed} SHACL file(s), ${total.shapes} root shape(s).`
		: `Indexed ${total.indexed} RDF file(s), ${total.shapes} root shape(s) available.`, ...total });
	return total;
}


export async function indexShaclFileUris(
	client: LanguageClient,
	files: vscode.Uri[],
	options: WorkspaceNotifyOptions = {},
	onProgress?: (progress: WorkspaceIndexProgress) => void,
): Promise<WorkspaceIndexResult> {
	return indexFileUris(client, files, { ...options, shaclOnly: options.shaclOnly ?? true }, onProgress, 'rdfusion/workspace/indexShaclFiles');
}

export async function indexRdfFileUris(
	client: LanguageClient,
	files: vscode.Uri[],
	options: WorkspaceNotifyOptions = {},
	onProgress?: (progress: WorkspaceIndexProgress) => void,
): Promise<WorkspaceIndexResult> {
	return indexFileUris(client, files, { ...options, shaclOnly: false }, onProgress, 'rdfusion/workspace/indexRdfFiles');
}

export async function indexWorkspaceShaclFiles(
	client: LanguageClient,
	globPattern = '**/*.{ttl,jsonld}',
	onProgress?: (progress: WorkspaceIndexProgress) => void,
): Promise<WorkspaceIndexResult> {
	onProgress?.({ phase: 'scanning', message: 'Scanning workspace for RDF files that may contain SHACL shapes…' });
	const files = await scanWorkspace(globPattern);
	return indexShaclFileUris(client, files, { shaclOnly: true, maxConcurrency: 4 }, onProgress);
}

export async function indexWorkspaceRdfFiles(
	client: LanguageClient,
	globPattern = '**/*.{ttl,jsonld}',
	onProgress?: (progress: WorkspaceIndexProgress) => void,
): Promise<WorkspaceIndexResult> {
	onProgress?.({ phase: 'scanning', message: 'Scanning workspace for RDF data and SHACL files…' });
	const files = await scanWorkspace(globPattern);
	return indexRdfFileUris(client, files, { shaclOnly: false, maxConcurrency: 3 }, onProgress);
}

export async function sendParsedRdfNotification(
	files: vscode.Uri[],
	client: LanguageClient,
	options: WorkspaceNotifyOptions = {}
): Promise<void> {
	await indexRdfFileUris(client, files, { ...options, shaclOnly: false });
}

export async function removeIndexedRdfFile(uri: vscode.Uri, client: LanguageClient): Promise<void> {
	try {
		await client.sendRequest('rdfusion/workspace/removeIndexedFile', { uri: uri.toString() });
	} catch {
		// fallback.
		client.sendNotification('workspace/removeParsedRdf', { uri: uri.toString() });
	}
}

export function notifyRemovedRdfFile(uri: vscode.Uri, client: LanguageClient): void {
	void removeIndexedRdfFile(uri, client);
}
