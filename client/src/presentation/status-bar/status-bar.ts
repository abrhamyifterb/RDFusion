import * as vscode from 'vscode';

export class StatusBarManager {
	private static item: vscode.StatusBarItem;

	public static register(context: vscode.ExtensionContext) {
		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.item.command = 'rdfusion.formatTriples';
		this.item.text = '$(code) Format TTL';
		this.item.tooltip = 'Format Turtle with RDFusion';

		const update = (editor?: vscode.TextEditor) => {
			if (editor?.document.languageId === 'turtle') {
				this.item.show();
			} else {
				this.item.hide();
			}
		};

		update(vscode.window.activeTextEditor);

		context.subscriptions.push(
			this.item,
			vscode.window.onDidChangeActiveTextEditor(update),
			vscode.workspace.onDidOpenTextDocument(doc => {
				if (vscode.window.activeTextEditor?.document === doc) {
					update(vscode.window.activeTextEditor);
				}
			})
		);
	}
}
