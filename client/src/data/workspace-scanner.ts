import * as vscode from 'vscode';
import { debounce } from '../utils/debounce';
import { scanWorkspace } from '../utils/workspace-find-files';


export type WorkspaceScanCallback = (files: vscode.Uri[]) => void;

export class WorkspaceScanner {
	private watcher: vscode.FileSystemWatcher;
	private debouncedScan: () => void;

	constructor(private globPattern: string, private callback: WorkspaceScanCallback, private debounceDelay = 500) {
		this.debouncedScan = debounce(() => this.performScan(), debounceDelay);
		this.watcher = vscode.workspace.createFileSystemWatcher(this.globPattern);
	}
	
	public startWatching(): void {
		this.watcher.onDidChange(() => this.debouncedScan());
		this.watcher.onDidCreate(() => this.debouncedScan());
		this.watcher.onDidDelete(() => this.debouncedScan());
	}
	
	public async performScan(): Promise<void> {
		try {
		const files = await scanWorkspace(this.globPattern);
		this.callback(files);
		//// console.log(`[WorkspaceScanner] Found ${files.length} file(s) matching ${this.globPattern}`);
		} catch (error) {
		console.error(`[WorkspaceScanner] Error scanning workspace: ${error}`);
		}
	}
	
	public dispose(): void {
		this.watcher.dispose();
	}
}
