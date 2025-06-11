import { Connection, 
	TextEdit, 
	Range, 
	Position, 
	TextDocuments 
} from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SortFormatter } from './sort-formatter';

export class SortTriplesCommand {
	constructor(
		private dataManager:    DataManager,
		private connection:     Connection,
		private documents:      TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string, mode: string, direction: string }): Promise<void> {
		try {
			const uri    = args.uri;
			const parsed = this.dataManager.getParsedData(uri) as ParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[Sort Triples] No parsed data for ${uri}`);
				return;
			}

			if (('errors' in parsed && parsed.errors?.length)) {
				this.connection.console.error(`[Sort Triples] Error during parsing data for ${uri}`);
				return;
			}
			const sortFormatter = new SortFormatter();
			const sortedText = sortFormatter.sortAndGroup(parsed, args.mode, args.direction);

			const doc = this.documents.get(uri);
			if (!doc) return;
			const fullRange: Range = {
				start: Position.create(0, 0),
				end:   Position.create(doc.lineCount - 1, doc.getText().split('\n').pop()!.length)
			};

			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, await sortedText) ] }
			});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			this.connection.console.error(`[Sort Triples] Failed to process:  ${error.message || error.toString()}`);
			console.error(`[Sort Triples] Failed to process: ${error.message || error.toString()}`);
			return;
		}
	}
}
