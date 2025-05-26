import { Connection } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';
import { VoIDGenerator } from './void-generate';

export class VoIDGenerateCommand {
	constructor(
		private dataManager:    DataManager,
		private connection:     Connection
	) {}

	public async execute(args: { uri: string }): Promise<string> {
		const uri    = args.uri;
		const parsed = this.dataManager.getParsedData(uri) as ParsedGraph| JsonldParsedGraph | undefined;
		if (!parsed) {
			this.connection.console.error(`[VoID Generate] No parsed data for ${uri}`);
			return '';
		}

		const voIDGenerator = new VoIDGenerator();
		const generatedVoID = voIDGenerator.generateVoID(parsed);
		return generatedVoID;
	}
}