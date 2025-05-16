import * as vscode from 'vscode';

export async function scanWorkspace(globPattern: string): Promise<vscode.Uri[]> {
	return vscode.workspace.findFiles(globPattern);
}
