/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	CompletionItem,
	TextDocumentPositionParams,
	TextDocuments,
} from 'vscode-languageserver';

export interface ICompletionProvider {
	provide(
		params: TextDocumentPositionParams,
		documents: TextDocuments<any>
	): Promise<CompletionItem[]>;
}
