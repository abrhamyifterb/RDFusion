import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import {
	indexRdfFileUris,
	indexShaclFileUris,
	indexWorkspaceRdfFiles,
	indexWorkspaceShaclFiles,
	notifyRemovedRdfFile,
	WorkspaceIndexProgress,
	WorkspaceIndexResult,
	WorkspaceNotifyOptions,
} from './workspace-notifier';

export interface WorkspaceIndexServiceOptions {
	globPattern: string;
	output?: vscode.OutputChannel;
	watchDebounceMs?: number;
}

interface PendingUri {
	uri: vscode.Uri;
	options: WorkspaceNotifyOptions;
}

/**
 * Owns client-side workspace RDF/SHACL discovery and watcher debouncing.
 *
 * The client only discovers candidate URIs and reports file metadata. The LSP
 * server owns parsing, snapshot retention, SHACL indexing, and diagnostics.
 */
export class WorkspaceIndexService implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly pending = new Map<string, PendingUri>();
	private watchTimer: NodeJS.Timeout | undefined;
	private workspaceScanInFlight: Promise<WorkspaceIndexResult> | undefined;
	private workspaceRdfScanInFlight: Promise<WorkspaceIndexResult> | undefined;
	private disposed = false;

	constructor(
		private readonly client: LanguageClient,
		private readonly options: WorkspaceIndexServiceOptions,
	) {}

	startWatching(context: vscode.ExtensionContext): void {
		const watcher = vscode.workspace.createFileSystemWatcher(this.options.globPattern);
		this.disposables.push(watcher);
		context.subscriptions.push(watcher);

		watcher.onDidCreate(uri => this.queueUri(uri, { shaclOnly: false }), null, this.disposables);
		watcher.onDidChange(uri => this.queueUri(uri, { shaclOnly: false }), null, this.disposables);
		watcher.onDidDelete(uri => this.removeUri(uri), null, this.disposables);
	}

	indexWorkspaceShacl(
		onProgress?: (progress: WorkspaceIndexProgress) => void,
		force = false,
	): Promise<WorkspaceIndexResult> {
		if (this.workspaceScanInFlight && !force) {
			onProgress?.({ phase: 'indexing', message: 'Workspace SHACL scan is already running; reusing the current scan.' });
			return this.workspaceScanInFlight;
		}

		this.workspaceScanInFlight = indexWorkspaceShaclFiles(
			this.client,
			this.options.globPattern,
			progress => {
				this.log(progress.message);
				onProgress?.(progress);
			},
		).finally(() => {
			this.workspaceScanInFlight = undefined;
		});

		return this.workspaceScanInFlight;
	}

	indexWorkspaceRdf(
		onProgress?: (progress: WorkspaceIndexProgress) => void,
		force = false,
	): Promise<WorkspaceIndexResult> {
		if (this.workspaceRdfScanInFlight && !force) {
			onProgress?.({ phase: 'indexing', message: 'Workspace RDF scan is already running; reusing the current scan.' });
			return this.workspaceRdfScanInFlight;
		}

		this.workspaceRdfScanInFlight = indexWorkspaceRdfFiles(
			this.client,
			this.options.globPattern,
			progress => {
				this.log(progress.message);
				onProgress?.(progress);
			},
		).finally(() => {
			this.workspaceRdfScanInFlight = undefined;
		});

		return this.workspaceRdfScanInFlight;
	}

	indexUris(
		uris: vscode.Uri[],
		options: WorkspaceNotifyOptions = { shaclOnly: true },
		onProgress?: (progress: WorkspaceIndexProgress) => void,
	): Promise<WorkspaceIndexResult> {
		const indexer = options.shaclOnly === false ? indexRdfFileUris : indexShaclFileUris;
		return indexer(this.client, uris, options, progress => {
			this.log(progress.message);
			onProgress?.(progress);
		});
	}

	queueUri(uri: vscode.Uri, options: WorkspaceNotifyOptions = { shaclOnly: true }): void {
		if (this.disposed) return;
		this.pending.set(uri.toString(), { uri, options });
		if (this.watchTimer) {
			clearTimeout(this.watchTimer);
		}
		const delay = this.options.watchDebounceMs ?? 750;
		this.watchTimer = setTimeout(() => {
			this.watchTimer = undefined;
			void this.flushPending();
		}, delay);
	}

	removeUri(uri: vscode.Uri): void {
		this.pending.delete(uri.toString());
		notifyRemovedRdfFile(uri, this.client);
		this.log(`Removed indexed RDF file ${uri.toString()}`);
	}

	async flushPending(): Promise<WorkspaceIndexResult | undefined> {
		if (this.pending.size === 0) return undefined;
		const entries = Array.from(this.pending.values());
		this.pending.clear();

		const uris = entries.map(entry => entry.uri);
		const shaclOnly = entries.every(entry => entry.options.shaclOnly !== false);
		this.log(`Indexing ${uris.length} changed RDF file(s)…`);
		return this.indexUris(uris, { shaclOnly, maxConcurrency: 2 });
	}

	dispose(): void {
		this.disposed = true;
		if (this.watchTimer) {
			clearTimeout(this.watchTimer);
			this.watchTimer = undefined;
		}
		this.disposables.forEach(d => d.dispose());
		this.disposables.length = 0;
		this.pending.clear();
	}

	private log(message: string): void {
		this.options.output?.appendLine(`[Workspace Index] ${message}`);
	}
}
