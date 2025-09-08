import * as vscode from 'vscode';
import { ExecuteCommandRequest } from 'vscode-languageclient/node';

interface LspPosition { line: number; character: number }

export function registerJsonLdBridge(context: vscode.ExtensionContext, client: import('vscode-languageclient/node').LanguageClient) {
	context.subscriptions.push(
		vscode.commands.registerCommand('jsonld.applyPrefixAndRename',
		async (uriStr: string, pos: LspPosition, preferred?: string) => {
			try {
			const uri = vscode.Uri.parse(uriStr);
			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: false });

			const position = new vscode.Position(pos.line, pos.character);
			editor.selections = [new vscode.Selection(position, position)];
			editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

			await client.sendRequest(ExecuteCommandRequest.type, {
				command: 'jsonld.applyPrefixServer',
				arguments: [uriStr, pos, preferred]
			});

			await vscode.commands.executeCommand('editor.action.rename');
			} catch (err) {
			console.error('applyPrefixAndRename failed', err);
			void vscode.window.showErrorMessage(String(err));
			}
		})
	);
}