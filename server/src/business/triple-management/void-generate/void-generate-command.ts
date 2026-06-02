import { Connection, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';
import { VoIDGenerator } from './void-generate';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getParsedGraphForCommand, hasParseDiagnostics } from '../parsed-document-helper.js';

export class VoIDGenerateCommand {
	constructor(
		private dataManager:    DataManager,
		private connection:     Connection,
		private documents?:     TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string }): Promise<string> {
		try {
			const uri    = args.uri;
			const parsed = this.documents
				? await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | JsonldParsedGraph | undefined
				: this.dataManager.getGraphSnapshot(uri) as ParsedGraph | JsonldParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[VoID] Could not generate metadata because no parsed RDF data is available for ${uri}`);
				return '';
			}

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[VoID] Could not generate metadata because the RDF document has parse errors: ${uri}`);
				return '';
			}

			const voIDGenerator = new VoIDGenerator();
			const generatedVoID = voIDGenerator.generateVoID(parsed);
			return generatedVoID;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (err: any) {
			this.connection.console.error(`[VoID] Failed to generate metadata: ${err.message || err.toString()}`);
			console.error(`VoID generation failed: ${err.message || err.toString()}`);
			return '';
		}
	}
}