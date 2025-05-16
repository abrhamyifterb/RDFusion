import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

export async function sendParsedRdfNotification(files: vscode.Uri[], client: LanguageClient): Promise<void> {
	for (const file of files) {
		try {
			const fileBytes = await vscode.workspace.fs.readFile(file);
			const text = Buffer.from(fileBytes).toString('utf8');
			const stat = await vscode.workspace.fs.stat(file);
			const version = stat.mtime; 

			client.sendNotification('workspace/parsedRdf', {
				uri: file.toString(),
				text,
				version
			});
			// // console.log(`WorkspaceNotifier => Sent notification for ${file.fsPath}`);
		} catch (error) {
			console.error(`WorkspaceNotifier => Error reading file ${file.fsPath}:`, error);
		}
	}
}
