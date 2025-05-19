import * as vscode from 'vscode';
import * as path from 'path';
import { FileItem } from './file-item';
import { FolderItem } from './folder-item';
import { scanWorkspace } from '../../utils/workspace-find-files';

export class FileTreeProvider implements vscode.TreeDataProvider<FolderItem | FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FolderItem | FileItem | undefined | void> = new vscode.EventEmitter<FolderItem | FileItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<FolderItem | FileItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FolderItem | FileItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: FolderItem | FileItem): Promise<(FolderItem | FileItem)[]> {
        if (!element) {
            let workspaceFolder: vscode.Uri;
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const wsFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
                workspaceFolder = wsFolder ? wsFolder.uri : vscode.Uri.file(path.dirname(activeEditor.document.uri.fsPath));
            } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                workspaceFolder = vscode.workspace.workspaceFolders[0].uri;
            } else {
                return [];
            }
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*.{jsonld,ttl}');
            const files = await scanWorkspace(pattern.pattern);
            return this.buildTree(files, workspaceFolder);
        } else {
            if (element instanceof FolderItem) {
                return element.children;
            }
            return [];
        }
    }

    private buildTree(files: vscode.Uri[], rootUri: vscode.Uri): (FolderItem | FileItem)[] {
        interface Node {
            children: Map<string, Node>;
            fileUri?: vscode.Uri;
        }

        const tree: Node = { children: new Map() };

        for (const fileUri of files) {
            const relativePath = path.relative(rootUri.fsPath, fileUri.fsPath);
            const parts = relativePath.split(path.sep);
            let current = tree;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (!current.children.has(part)) {
                    current.children.set(part, { children: new Map() });
                }
                current = current.children.get(part)!;
                if (i === parts.length - 1) {
                    current.fileUri = fileUri;
                }
            }
        }

        const convert = (node: Node, label: string, parentUri: vscode.Uri): FolderItem | FileItem => {
        if (node.fileUri) {
            return new FileItem(node.fileUri, label);
        } else {
            const folderPath = path.join(parentUri.fsPath, label);
            const folderUri = vscode.Uri.file(folderPath);
            const folderItem = new FolderItem(folderUri, label);
            const items: (FolderItem | FileItem)[] = [];
            const sortedKeys = Array.from(node.children.keys()).sort((a, b) => {
            const nodeA = node.children.get(a)!;
            const nodeB = node.children.get(b)!;
            const aIsFile = !!nodeA.fileUri;
            const bIsFile = !!nodeB.fileUri;
            if (aIsFile === bIsFile) {
                return a.localeCompare(b);
            }
            return aIsFile ? 1 : -1; 
            });
            for (const key of sortedKeys) {
            const childNode = node.children.get(key)!;
            items.push(convert(childNode, key, folderUri));
            }
            folderItem.children = items;
            return folderItem;
        }
        };

        const rootItems: (FolderItem | FileItem)[] = [];
        const sortedKeys = Array.from(tree.children.keys()).sort((a, b) => {
        const nodeA = tree.children.get(a)!;
        const nodeB = tree.children.get(b)!;
        const aIsFile = !!nodeA.fileUri;
        const bIsFile = !!nodeB.fileUri;
        if (aIsFile === bIsFile) {
            return a.localeCompare(b);
        }
        return aIsFile ? 1 : -1;
        });
        for (const key of sortedKeys) {
            rootItems.push(convert(tree.children.get(key)!, key, rootUri));
        }
        return rootItems;
    }
}


export function watchFiles(fileTreeProvider: FileTreeProvider): void {
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.{ttl,jsonld}");
    watcher.onDidChange(() => fileTreeProvider.refresh());
    watcher.onDidCreate(() => fileTreeProvider.refresh());
    watcher.onDidDelete(() => fileTreeProvider.refresh());
}
