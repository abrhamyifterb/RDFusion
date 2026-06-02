/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, TextDocuments, TextEdit } from 'vscode-languageserver';
import jsonld from 'jsonld';
import { JsonldParsedGraph } from '../../../../data/irdf-parser';
import { DataManager } from '../../../../data/data-manager';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Writer } from 'n3';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../../parsed-document-helper.js';

export class JsonldFrameCommand {
	constructor(
	private dataManager:    DataManager,
	private connection:     Connection,
	private documents:      TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string, data: string }): Promise<void> {
		try {
			const uri    = args.uri;
			const parsed = await getParsedGraphForCommand(this.dataManager, this.documents, uri) as JsonldParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[JSON-LD Frame] Could not frame because no parsed JSON-LD data is available for ${uri}`);
				return;
			}
			
			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[JSON-LD Frame] Could not frame because the JSON-LD document has parse errors: ${uri}`);
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
			if (doc.languageId !== 'jsonld') {
				this.connection.window.showWarningMessage('JSON-LD framing requires a JSON-LD document.');
				return;
			}

			const fullRange = fullDocumentRange(doc);
	
			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, JSON.stringify(framed, null, 2)) ] }
			});

		} catch (err: any) {
			this.connection.console.error(`[JSON-LD Frame] Could not apply the selected frame: ${err.message}`);
			return;
		}
	}
}