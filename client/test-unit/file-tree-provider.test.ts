import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { FileTreeProvider } from '../src/presentation/activity-bar/file-tree-provider';

describe('FileTreeProvider workspace scope', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps the selected workspace folder in the RDF file search pattern', async () => {
		const workspaceFolder = { fsPath: '/workspace/one' } as vscode.Uri;
		Object.assign(vscode.workspace, {
			workspaceFolders: [{ uri: workspaceFolder }],
		});
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

		const provider = new FileTreeProvider();
		await provider.getChildren();

		const [include] = vi.mocked(vscode.workspace.findFiles).mock.calls[0];
		expect(include).toBeInstanceOf(vscode.RelativePattern);
		expect(include).toMatchObject({
			baseUri: workspaceFolder,
			pattern: '**/*.{jsonld,ttl}',
		});
	});
});
