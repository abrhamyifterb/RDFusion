/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Connection,
	TextDocuments,
	TextEdit,
	Range,
	Position,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { UnicodeEscapesTransformer } from './unicode-escapes-transformer';


export class UnicodeEscapesCommand {
	private readonly transformer = new UnicodeEscapesTransformer();

	constructor(
		private readonly connection: Connection,
		private readonly documents: TextDocuments<TextDocument>
	) {}

	public async execute(args: { uri: string, mode: string }): Promise<void> {
		try {
		const { uri, mode } = args;

		const doc = this.documents.get(uri);
		if (!doc) return;
		if (doc.languageId !== 'turtle') return;

		const originalText = doc.getText();
		const nextText = this.transformer.transform(originalText, mode);

		const fullRange: Range = {
			start: Position.create(0, 0),
			end: doc.positionAt(originalText.length),
		};

		await this.connection.workspace.applyEdit({
			changes: { [uri]: [TextEdit.replace(fullRange, nextText)] },
		});
		} catch (error: any) {
		this.connection.console.error(
			`[Unicode Escapes] Failed: ${error?.message ?? String(error)}`
		);
		}
	}
}
