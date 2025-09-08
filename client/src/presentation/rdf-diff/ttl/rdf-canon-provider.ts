import * as vscode from 'vscode';

export class RdfCanonProvider implements vscode.TextDocumentContentProvider {
  static scheme = 'rdfcanon';
  private cache = new Map<string, string>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  set(uri: vscode.Uri, content: string) {
    this.cache.set(uri.toString(), content);
    this.emitter.fire(uri);
  }
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? '';
  }
}
