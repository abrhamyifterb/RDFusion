import * as vscode from 'vscode';
import { FileItem } from './file-item';

export class FolderItem extends vscode.TreeItem {
    public children: (FolderItem | FileItem)[] = [];

    constructor(public readonly resourceUri: vscode.Uri, label: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.tooltip = resourceUri.fsPath;
        this.description = '';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'folder';
    }
}