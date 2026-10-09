import { vi } from 'vitest';

export class EventEmitter {
	readonly event = vi.fn();
	readonly fire = vi.fn();
	readonly dispose = vi.fn();
}

export class RelativePattern {
	constructor(
		readonly baseUri: unknown,
		readonly pattern: string,
	) {}
}

export class TreeItem {}

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1 };
export class ThemeIcon {}

export const workspace = {
	findFiles: vi.fn(),
	getWorkspaceFolder: vi.fn(),
	workspaceFolders: [] as { uri: unknown }[],
};

export const window = {
	activeTextEditor: undefined,
};

export const Uri = {
	file: (fsPath: string) => ({ fsPath }),
};
