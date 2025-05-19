import * as vscode from 'vscode';
import * as path from 'path';

export class FileItem extends vscode.TreeItem {
    constructor(public readonly resourceUri: vscode.Uri, label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = resourceUri.fsPath;
        this.description = '';
        this.command = {
            command: 'rdfusion.openFile',
            title: 'Open File',
            arguments: [this.resourceUri]
        };

        const ext = path.extname(this.resourceUri.fsPath);
        if (ext === '.jsonld' || ext === '.ttl') {
            this.iconPath = new vscode.ThemeIcon('file-code');
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }
        this.contextValue = 'file';
    }
}