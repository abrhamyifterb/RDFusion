import {
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocuments,
	Connection
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseTree } from 'jsonc-parser';
import { ICompletionProvider } from '../icompletion-provider.js';
import { TermProvider } from './term-provider.js';
import { PrefixRegistry } from '../prefix/prefix-registry.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings.js';

export class JsonLdTermCompletionProvider implements ICompletionProvider {
	private configSettings: RDFusionConfigSettings;
	constructor(
		private termProvider: TermProvider,
		private registry: PrefixRegistry,
		private connection: Connection,
		initialSettings: RDFusionConfigSettings
	) {
		this.configSettings = initialSettings;
	}

	public async provide(
		params: TextDocumentPositionParams,
		documents: TextDocuments<TextDocument>
	): Promise<CompletionItem[]> {
		const uri = params.textDocument.uri;
		const doc = documents.get(uri);
		if (!doc) {
			return [];
		}

		const text = doc.getText();
		const offset = doc.offsetAt(params.position);
		const root = parseTree(text, [], {
			allowTrailingComma: true,
			disallowComments: false
		});
		if (!root) {
			return [];
		}

		const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
		const before = text.substring(lineStart, offset);

		// eslint-disable-next-line no-useless-escape
		const usageMatch = before.match(/\s*"([A-Za-z_]\w*):([\w\-]*)?$/);
		if (!usageMatch) {
			return [];
		}
		const [, prefix, fragment = ''] = usageMatch;

		const terms = await this.termProvider.getTermsFor(prefix, this.connection);
		if (!terms.length) {
			return [];
		}

		const suggestions: CompletionItem[] = [];
		for (const term of terms.filter(t => t.startsWith(fragment)).slice(0, 50)) {
			const item: CompletionItem = {
			label: term,
			kind: CompletionItemKind.Property,
			insertText: term,
			detail: `Term from prefix ${prefix}`
			};
			suggestions.push(item);
		}

		return suggestions;
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
