import { Connection, TextEdit, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SortFormatter } from './sort-formatter';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../parsed-document-helper.js';

export class SortTriplesCommand {
	constructor(
		private dataManager:    DataManager,
		private connection:     Connection,
		private documents:      TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string, mode: string, direction: string }): Promise<void> {
		try {
			const uri    = args.uri;
			const parsed = await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[Sort Triples] Could not sort because no parsed RDF data is available for ${uri}`);
				return;
			}

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[Sort Triples] Could not sort because the RDF document has parse errors: ${uri}`);
				return;
			}
			const sortFormatter = new SortFormatter();
			const sortedText = sortFormatter.sortAndGroup(parsed, args.mode, args.direction);

			const doc = this.documents.get(uri);
			if (!doc) return;
			const fullRange = fullDocumentRange(doc);

			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, await sortedText) ] }
			});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.connection.console.error(`[Sort Triples] Failed to sort triples: ${error.message || error.toString()}`);
			console.error(`[Sort Triples] Failed to sort triples: ${error.message || error.toString()}`);
			return;
		}
	}
}
