import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { RdfCanonProvider } from './rdf-canon-provider';
import { getGitAPI, readAt } from './git-utils';

async function getWorkingNQuadsUnified(client: LanguageClient, uri: vscode.Uri): Promise<string | null> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const nq = await client.sendRequest<string | null>('rdf/ttlToNQuads', { text, base: uri.toString() });
  return nq && nq.trim() ? nq : null;
}

async function getRefNQuads(client: LanguageClient, uri: vscode.Uri, ref: string): Promise<string | null> {
  const api = getGitAPI();
  if (!api) {return null;}
  const ttl = await readAt(api, uri, ref);
  if (ttl == null || !ttl.trim()) {return null;}
  const nq = await client.sendRequest<string | null>('rdf/ttlToNQuads', { text: ttl, base: uri.toString() });
  return nq && nq.trim() ? nq : null;
}

async function canonPair(
  client: LanguageClient,
  leftNQ: string,
  rightNQ: string
): Promise<{ left: string; right: string }> {
  const canonBNodes = vscode.workspace.getConfiguration('rdfDiff').get<boolean>('canonicalizeBNodes', true);
  return client.sendRequest<{ left: string; right: string }>('rdf/canonPair', {
    left: leftNQ,
    right: rightNQ,
    canonicalizeBNodes: canonBNodes,
    alignRightToLeft: false
  });
}

function makeRdfUri(base: vscode.Uri, side: 'left'|'right', tag: string) {
  return vscode.Uri.from({
    scheme: RdfCanonProvider.scheme,
    path: base.path,
    query: `side=${side}&tag=${encodeURIComponent(tag)}&t=${Date.now()}`
  });
}

export function registerRdfDiffCommands(context: vscode.ExtensionContext, client: LanguageClient) {
  const provider = new RdfCanonProvider();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(RdfCanonProvider.scheme, provider));

  const ensureTurtle = (ed?: vscode.TextEditor) => {
    const e = ed ?? vscode.window.activeTextEditor;
    if (!e) { vscode.window.showInformationMessage('Open a Turtle file.'); return null; }
    if (!e.document.fileName.toLowerCase().endsWith('.ttl')) {
      vscode.window.showWarningMessage('RDF Diff commands work on .ttl files.');
      return null;
    }
    return e;
  };

  context.subscriptions.push(vscode.commands.registerCommand('rdfdiff.compareWithHEAD', async () => {
    const ed = ensureTurtle(); if (!ed) return;
    const uri = ed.document.uri;

    const [leftNQ, rightNQ] = await Promise.all([
      getRefNQuads(client, uri, 'HEAD'),
      getWorkingNQuadsUnified(client, uri) 
    ]);

    if (!leftNQ && !rightNQ) { vscode.window.showWarningMessage('RDF Diff: neither HEAD nor Working are loaded.'); return; }
    if (!leftNQ) { vscode.window.showWarningMessage('RDF Diff: could not load HEAD.'); return; }
    if (!rightNQ) { vscode.window.showWarningMessage('RDF Diff: could not load Working.'); return; }

    const pair = await canonPair(client, leftNQ, rightNQ);

    const LU = makeRdfUri(uri, 'left', 'HEAD');
    const RU = makeRdfUri(uri, 'right', 'WORK');
    provider.set(LU, pair.left);
    provider.set(RU, pair.right);
    await vscode.commands.executeCommand('vscode.diff', LU, RU, `RDF Diff (HEAD ↔ Working): ${ed.document.fileName.split(/[\\/]/).pop()}`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('rdfdiff.compareWithRef', async () => {
    const ed = ensureTurtle(); if (!ed) return;
    const uri = ed.document.uri;
    const ref = await vscode.window.showInputBox({
      prompt: 'Enter a Git ref', 
      placeHolder: 'e.g. HEAD~1, main, 1a2b3c4'
    });
    if (!ref) return;

    const [leftNQ, rightNQ] = await Promise.all([
      getRefNQuads(client, uri, ref),
      getWorkingNQuadsUnified(client, uri)
    ]);

    if (!leftNQ && !rightNQ) { 
      vscode.window.showWarningMessage(`RDF Diff: neither ${ref} nor Working are loaded.`); 
      return; 
    }
    if (!leftNQ) { 
      vscode.window.showWarningMessage(`RDF Diff: could not load ${ref}.`); 
      return; 
    }
    if (!rightNQ) { 
      vscode.window.showWarningMessage('RDF Diff: could not load Working.'); 
      return; 
    }

    const pair = await canonPair(client, leftNQ, rightNQ);

    const LU = makeRdfUri(uri, 'left', ref);
    const RU = makeRdfUri(uri, 'right', 'WORK');
    provider.set(LU, pair.left);
    provider.set(RU, pair.right);
    await vscode.commands.executeCommand('vscode.diff', LU, RU, `RDF Diff (${ref} ↔ Working): ${ed.document.fileName.split(/[\\/]/).pop()}`);
  }));
}
