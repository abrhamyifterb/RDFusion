import * as vscode from 'vscode';

const DEFAULT_EXCLUDE = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/coverage/**,**/.rdfusion-*/**,**/.vscode-test/**,**/server/node_modules/**,**/client/out/**,**/server/out/**}';

export async function scanWorkspace(globPattern: string): Promise<vscode.Uri[]> {
	return vscode.workspace.findFiles(globPattern, DEFAULT_EXCLUDE);
}
