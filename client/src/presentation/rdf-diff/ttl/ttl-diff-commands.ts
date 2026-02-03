/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { RdfCanonProvider } from './rdf-canon-provider';
import { getGitAPI, readAt } from './git-utils';

interface IsoPairResult {
	leftAligned: string;
	rightAligned: string;
	isIsomorphic: boolean;
	method?: 'CANON' | 'URDNA' | 'SORT' | 'BACKTRACK';
}

function extractUri(arg: unknown): vscode.Uri | null {
	if (!arg) {return null;}
	if (arg instanceof vscode.Uri) {return arg;}
	const a: any = arg as any;
	if (a?.resourceUri instanceof vscode.Uri) {return a.resourceUri;}
	if (a?.resourceUri && typeof a.resourceUri?.path === 'string') {
		try { return vscode.Uri.from(a.resourceUri); } catch { /* ignore */ }
	}
	return null;
}

async function getWorkingTurtle(uri: vscode.Uri): Promise<string | null> {
	const doc = await vscode.workspace.openTextDocument(uri);
	const ttl = doc.getText();
	return ttl && ttl.trim() ? ttl : null;
}

async function getRefTurtle(uri: vscode.Uri, ref: string): Promise<string | null> {
	const api = getGitAPI();
	if (!api) {return null;}
	const ttl = await readAt(api, uri, ref);
	return ttl && ttl.trim() ? ttl : null;
}

async function isomorphicPair(
	client: LanguageClient,
	leftTurtle: string,
	rightTurtle: string,
	baseIRI: string
): Promise<IsoPairResult> {
	return client.sendRequest<IsoPairResult>('rdf/isomorphicPair', {
		leftTurtle,
		rightTurtle,
		baseIRI
	});
}

function makeRdfUri(base: vscode.Uri, side: 'left' | 'right', tag: string) {
	return vscode.Uri.from({
		scheme: RdfCanonProvider.scheme,
		path: base.path,
		query: `side=${side}&tag=${encodeURIComponent(tag)}&t=${Date.now()}`
	});
}

export function registerRdfDiffCommands(context: vscode.ExtensionContext, client: LanguageClient) {
	const provider = new RdfCanonProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(RdfCanonProvider.scheme, provider)
	);

	async function ensureTurtleUri(arg?: unknown): Promise<vscode.Uri | null> {
		const u = extractUri(arg) ?? vscode.window.activeTextEditor?.document.uri;
		if (!u) {
			vscode.window.showInformationMessage('Open a Turtle file.');
			return null;
		}
		if (!u.fsPath.toLowerCase().endsWith('.ttl')) {
			vscode.window.showWarningMessage('RDF Diff commands work on .ttl files.');
			return null;
		}
		return u;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.compareWithHEAD', async (arg?: unknown) => {
			const uri = await ensureTurtleUri(arg);
			if (!uri) {return;}

			const [headTTL, workTTL] = await Promise.all([
				getRefTurtle(uri, 'HEAD'),
				getWorkingTurtle(uri)
			]);

			if (!headTTL && !workTTL) {
				vscode.window.showWarningMessage('RDF Diff: neither HEAD nor Working are loaded.');
				return;
			}
			if (!headTTL) {
				vscode.window.showWarningMessage('RDF Diff: could not load HEAD.');
				return;
			}
			if (!workTTL) {
				vscode.window.showWarningMessage('RDF Diff: could not load Working.');
				return;
			}

			const pair = await isomorphicPair(client, headTTL, workTTL, uri.toString());

			const LU = makeRdfUri(uri, 'left', 'HEAD');
			const RU = makeRdfUri(uri, 'right', 'WORK');
			provider.set(LU, pair.leftAligned);
			provider.set(RU, pair.rightAligned);

			const fileName = uri.fsPath.split(/[\\/]/).pop();
			const tag = pair.method ? ` • ${pair.method}` : '';
			await vscode.commands.executeCommand(
				'vscode.diff',
				LU,
				RU,
				`RDF Semantic Diff (HEAD ↔ Working)${tag}: ${fileName}`
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.compareWithRef', async (arg?: unknown) => {
			const uri = await ensureTurtleUri(arg);
			if (!uri) {return;}

			const ref = await vscode.window.showInputBox({
				prompt: 'Enter a Git ref',
				placeHolder: 'e.g. HEAD~1, main, 1a2b3c4'
			});
			if (!ref) {return;}

			const [refTTL, workTTL] = await Promise.all([
				getRefTurtle(uri, ref),
				getWorkingTurtle(uri)
			]);

			if (!refTTL && !workTTL) {
				vscode.window.showWarningMessage(`RDF Diff: neither ${ref} nor Working are loaded.`);
				return;
			}
			if (!refTTL) {
				vscode.window.showWarningMessage(`RDF Diff: could not load ${ref}.`);
				return;
			}
			if (!workTTL) {
				vscode.window.showWarningMessage('RDF Diff: could not load Working.');
				return;
			}

			const pair = await isomorphicPair(client, refTTL, workTTL, uri.toString());

			const LU = makeRdfUri(uri, 'left', ref);
			const RU = makeRdfUri(uri, 'right', 'WORK');
			provider.set(LU, pair.leftAligned);
			provider.set(RU, pair.rightAligned);

			const fileName = uri.fsPath.split(/[\\/]/).pop();
			const tag = pair.method ? ` • ${pair.method}` : '';
			await vscode.commands.executeCommand(
				'vscode.diff',
				LU,
				RU,
				`RDF Semantic Diff (${ref} ↔ Working)${tag}: ${fileName}`
			);
		})
	);
}
