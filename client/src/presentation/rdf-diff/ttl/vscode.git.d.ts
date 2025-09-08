declare module 'vscode.git' {
	import * as vscode from 'vscode';

	export interface Change {
		readonly uri: vscode.Uri;
		readonly originalUri: vscode.Uri;
		readonly renameUri?: vscode.Uri;
	}

	export interface RepositoryState {
		readonly rootUri: vscode.Uri;
		readonly workingTreeChanges: Change[];
		readonly indexChanges: Change[];
		readonly mergeChanges: Change[];
	}

	export interface Repository {
		readonly rootUri: vscode.Uri;
		readonly state: RepositoryState;
	}

	export interface API {
		readonly repositories: Repository[];
		onDidOpenRepository: vscode.Event<Repository>;
		onDidCloseRepository: vscode.Event<Repository>;
		getRepository(uri: vscode.Uri): Repository | null;
	}

	export interface GitExtension {
		readonly enabled: boolean;
		readonly onDidChangeEnablement: vscode.Event<boolean>;
		getAPI(version: number): API;
	}
}
