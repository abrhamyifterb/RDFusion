import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

async function getSemanticDelta(
  client: LanguageClient,
  leftNQ: string,
  rightNQ: string
): Promise<{ adds: number; dels: number }> {
  const pair = await client.sendRequest<{ left: string; right: string }>('rdf/canonPair', {
    left: leftNQ,
    right: rightNQ,
    canonicalizeBNodes: true,
    alignRightToLeft: true
  });
  const { adds, dels } = await client.sendRequest<{ adds: string[]; dels: string[] }>('rdf/diffCanonical', pair);
  return { adds: adds.length, dels: dels.length };
}



async function ttlToNQ(client: LanguageClient, ttl: string, base: string): Promise<string | null> {
	const nq = await client.sendRequest<string | null>('rdf/ttlToNQuads', { text: ttl, base });
	return nq && nq.trim() ? nq : null;
}
async function getWorkingNQ(client: LanguageClient, uri: vscode.Uri): Promise<string | null> {
	const doc = await vscode.workspace.openTextDocument(uri);
	return ttlToNQ(client, doc.getText(), uri.toString());
}
async function getHeadNQ(client: LanguageClient, uri: vscode.Uri): Promise<string | null> {
	const git = vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1);
	if (!git) {return null;}
	const repo = git.repositories.find(r => uri.fsPath.startsWith(r.rootUri.fsPath));
	if (!repo) {return null;}
	const rel = uri.fsPath.substring(repo.rootUri.fsPath.length + 1).replace(/\\/g, '/');
	const ttl = await repo.show('HEAD', rel).catch(() => undefined);
	if (!ttl) {return null;}
	return ttlToNQ(client, ttl, uri.toString());
}

export class RdfFileDecorationProvider implements vscode.FileDecorationProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChangeFileDecorations = this._onDidChange.event;

	private deltas = new Map<string, { adds: number; dels: number }>();

	update(uri: vscode.Uri, delta: { adds: number; dels: number }) {
		this.deltas.set(uri.toString(), delta);
		this._onDidChange.fire(uri);
	}

	clear(uri: vscode.Uri) {
		this.deltas.delete(uri.toString());
		this._onDidChange.fire(uri);
	}

	provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
		if (!uri.fsPath.toLowerCase().endsWith('.ttl')) {return;}
		const d = this.deltas.get(uri.toString());
		if (!d) {return;}
		const total = d.adds + d.dels;
		if (total === 0) {return;}
		const badge = total.toString();
		const tooltip = `Turtle changes vs HEAD: +${d.adds} / −${d.dels}`;
		return { badge, tooltip, propagate: false };
	}
}

export class RdfScm {
	private scm: vscode.SourceControl;
	private group: vscode.SourceControlResourceGroup;
	private deco: RdfFileDecorationProvider;

	constructor(
		private context: vscode.ExtensionContext,
		private client: LanguageClient
	) {
		this.scm = vscode.scm.createSourceControl('rdfdiff', 'RDF Diff');
		this.group = this.scm.createResourceGroup('changes', 'RDF Changes');
		this.scm.count = 0;

		this.deco = new RdfFileDecorationProvider();
		this.context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(this.deco)
		);

		this.context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(e => this.refresh(e?.document.uri)),
		vscode.workspace.onDidSaveTextDocument(doc => this.refresh(doc.uri))
		);

		this.refresh(vscode.window.activeTextEditor?.document.uri);
	}

	dispose() {
		this.scm.dispose();
	}

	async refresh(uri?: vscode.Uri) {
		try {
			if (!uri || !uri.fsPath.toLowerCase().endsWith('.ttl')) {
				this.group.resourceStates = [];
				this.scm.count = 0;
				return;
			}

			const [leftNQ, rightNQ] = await Promise.all([
				getHeadNQ(this.client, uri),
				getWorkingNQ(this.client, uri)
			]);

			if (!leftNQ || !rightNQ) {
				this.group.resourceStates = [];
				this.scm.count = 0;
				this.deco.clear(uri);
				return;
			}

			const delta = await getSemanticDelta(this.client, leftNQ, rightNQ);
			this.scm.count = delta.adds + delta.dels;
			this.deco.update(uri, delta);

			const openDiffCmd: vscode.Command = {
				title: 'Open RDF Changes',
				command: 'rdfdiff.compareWithHEAD',
				arguments: [uri]
			};

			const state: vscode.SourceControlResourceState = {
				resourceUri: uri,
				command: openDiffCmd,
				decorations: {
				tooltip: `RDF changes vs HEAD: +${delta.adds} / −${delta.dels}`
				}
			};

			this.group.resourceStates = (delta.adds + delta.dels) ? [state] : [];
		} catch (err) {
			console.error('[RDF SCM] refresh error', err);
			this.group.resourceStates = [];
			this.scm.count = 0;
			if (uri) {this.deco.clear(uri);}
		}
	}
}
