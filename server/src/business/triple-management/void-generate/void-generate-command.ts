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
		try {
			const uri    = args.uri;
			const parsed = this.dataManager.getParsedData(uri) as ParsedGraph| JsonldParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[VoID Generate] No parsed data for ${uri}`);
				return '';
			}

			if (('errors' in parsed && parsed.errors?.length) || ('diagnostics' in parsed && parsed.diagnostics.length)) {
				this.connection.console.error(`[VoID Generate] Error during parsing data for ${uri}`);
				return '';
			}

			const voIDGenerator = new VoIDGenerator();
			const generatedVoID = voIDGenerator.generateVoID(parsed);
			return generatedVoID;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			this.connection.console.error(`[VoID Generate] Failed to process : ${err.message || err.toString()}`);
			console.error(`VoID Generation failed: ${err.message || err.toString()}`);
			return '';
		}
	}
}