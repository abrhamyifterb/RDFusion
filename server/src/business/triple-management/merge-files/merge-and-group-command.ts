import { Connection } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { MergeGroupService } from './merge-group';

export interface MergeParams {
	files: {
		uri: string;
		text: string;
		version: number;
	}[];
}

export class MergeGroupCommand {
	constructor(
		private dataManager:    DataManager,
		private connection:     Connection
	) {}

	public async execute(params: MergeParams): Promise<string> {
		try {
			const mergeAndGroup = new MergeGroupService(this.dataManager);
			const mergedGrouped= mergeAndGroup.mergeAndGroup(params);
			return mergedGrouped;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			this.connection.window.showErrorMessage(`[Merge] Failed to process: ${err.message || err.toString()}`);
			console.error(`[Merge] Failed to process: ${err.message || err.toString()}`);
			return '';
		}
	}
}