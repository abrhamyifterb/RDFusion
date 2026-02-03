import * as vscode from 'vscode';

export class StatusBarManager {
	private static item: vscode.StatusBarItem;
	private static diffHeadItem: vscode.StatusBarItem;

	public static register(context: vscode.ExtensionContext) {
		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);

		this.diffHeadItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);

		this.item.command = 'rdfusion.formatTriples';
		this.item.text = '$(code) Format TTL';
		this.item.tooltip = 'Format Turtle with RDFusion';

		this.diffHeadItem.command = 'rdfusion.compareWithHEAD';
		this.diffHeadItem.text = '$(git-compare) RDF Diff';
		this.diffHeadItem.tooltip = 'RDF Diff: Compare current file with HEAD';

		const update = (editor?: vscode.TextEditor) => {
			if (editor?.document.languageId === 'turtle') {
				this.item.show();
				this.diffHeadItem.show();
			} else {
				this.diffHeadItem.hide();
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

		context.subscriptions.push(
			this.diffHeadItem,
			vscode.window.onDidChangeActiveTextEditor(update),
			vscode.workspace.onDidOpenTextDocument(doc => {
				if (vscode.window.activeTextEditor?.document === doc) {
					update(vscode.window.activeTextEditor);
				}
			})
		);
	}
}
