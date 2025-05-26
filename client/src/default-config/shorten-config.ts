import * as vscode from 'vscode';

export interface IriShortenConfig {
	enabled: boolean;
	maxLength: number;
}

export function getIriShortenConfig(): IriShortenConfig {
	const config = vscode.workspace.getConfiguration('rdfusion.turtle.irishorten');
	return {
		enabled: config.get<boolean>('enabled', false)!,
		maxLength: config.get<number>('maxLength', 30)!
	};
}

