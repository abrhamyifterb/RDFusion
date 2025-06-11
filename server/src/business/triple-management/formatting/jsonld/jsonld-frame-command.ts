/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, Position, Range, TextDocuments, TextEdit } from 'vscode-languageserver';
import jsonld from 'jsonld';
import { JsonldParsedGraph } from '../../../../data/irdf-parser';
import { DataManager } from '../../../../data/data-manager';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Writer } from 'n3';

export class JsonldFrameCommand {
	constructor(
	private dataManager:    DataManager,
	private connection:     Connection,
	private documents:      TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string, data: string }): Promise<void> {
		try {
			const uri    = args.uri;
			const parsed = this.dataManager.getParsedData(uri) as JsonldParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[JsonLdFramer] No parsed data for ${uri}`);
				return;
			}
			
			if ('diagnostics' in parsed && parsed.diagnostics.length) {
				this.connection.console.error(`[JsonLdFramer] Error during parsing data for ${uri}`);
				return;
			}
			const writer = new Writer({ format: 'N-Quads' });
			parsed.quads.forEach(q => writer.addQuad(q));
			const nquads = await new Promise<string>((resolve, reject) =>
				writer.end((err: any, result: string | PromiseLike<string>) => err ? reject(err) : resolve(result))
			);
		
			const expanded = await jsonld.fromRDF(nquads, { format: 'application/n-quads' });
			const frame = JSON.parse(args.data);
			const framed = await jsonld.frame(expanded, frame);

			const doc = this.documents.get(uri);
			if (!doc) return;

			const fullRange: Range = {
				start: Position.create(0, 0),
				end:   Position.create(doc.lineCount - 1, doc.getText().split('\n').pop()!.length)
			};
	
			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, JSON.stringify(framed, null, 2)) ] }
			});

		} catch (err: any) {
			this.connection.console.error(`[JsonLdFramer] Failed to apply frame: ${err.message}`);
			return;
		}
	}
}