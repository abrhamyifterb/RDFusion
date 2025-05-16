import {
	CompletionItem,
	CompletionItemKind,
	Connection,
	TextDocumentPositionParams,
	TextDocuments
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ICompletionProvider } from '../icompletion-provider';
import { TermProvider } from './term-provider';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

export class TtlTermCompletionProvider implements ICompletionProvider {
	private configSettings: RDFusionConfigSettings;
	constructor(
		private termProvider: TermProvider,
		private connection: Connection,
		initialSettings: RDFusionConfigSettings
	) {
		this.configSettings = initialSettings;
	}

	public async provide(
		params: TextDocumentPositionParams,
		documents: TextDocuments<TextDocument>
	): Promise<CompletionItem[]> {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return [];
	
		const lineText = doc.getText({
			start: { line: params.position.line, character: 0 },
			end: params.position
		});
	
		// eslint-disable-next-line no-useless-escape
		const m = lineText.match(/([A-Za-z][\w-]*)\:([\w]*)$/);
		if (!m) return [];
	
		const [, prefix, fragment] = m;
		const terms = await this.termProvider.getTermsFor(prefix, this.connection);

		return terms
			.filter(term => term.startsWith(fragment))
			.slice(0, 50)  
			.map(term => ({
				label: `${term}`,
				kind: CompletionItemKind.Property,
				insertText: term,
				detail: `from ${prefix}`
		}));
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
