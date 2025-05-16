import {
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocuments,
	TextEdit,
	Position,
	Connection
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseTree, Node } from 'jsonc-parser';
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

		const ctxNode = this.findContextNode(root, text);

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

		const declared = new Set<string>();
		if (ctxNode) {
			for (const prop of ctxNode.children || []) {
			if (prop.type === 'property' && prop.children?.[0].type === 'string') {
				try {
				const key = JSON.parse(
					text.slice(
					prop.children[0].offset,
					prop.children[0].offset + prop.children[0].length
					)
				);
				declared.add(key);
				} catch {
					/*  */
				}
			}
			}
		}

		const suggestions: CompletionItem[] = [];
		for (const term of terms.filter(t => t.startsWith(fragment)).slice(0, 50)) {
			const item: CompletionItem = {
			label: term,
			kind: CompletionItemKind.Property,
			insertText: term,
			detail: `Term from prefix ${prefix}`
			};

			if (ctxNode && !declared.has(prefix)) {
			const iri = await this.registry.ensure(prefix);
			if (iri) {
				const edit = this.makeContextInsertEdit(doc, uri, prefix, iri);
				if (edit) {
				item.additionalTextEdits = [edit];
				}
			}
			}

			suggestions.push(item);
		}

		return suggestions;
	}

	private findContextNode(root: Node, text: string): Node | undefined {
		const stack: Node[] = [root];
		while (stack.length) {
			const node = stack.pop()!;
			if (
				node.type === 'property' &&
				Array.isArray(node.children) &&
				node.children.length >= 2 &&
				node.children[0].type === 'string'
			) {
			try {
				const key = JSON.parse(
				text.slice(
					node.children[0].offset,
					node.children[0].offset + node.children[0].length
				)
				);
				if (key === '@context') {
				return node.children[1];
				}
			} catch {
				/*  */
			}
			}
			if (node.children) {
			stack.push(...node.children);
			}
		}
		return undefined;
	}

	private makeContextInsertEdit(
		doc: TextDocument,
		uri: string,
		prefix: string,
		iri: string
	): TextEdit | undefined {
		const text = doc.getText();
		const root = parseTree(text, [], {
			allowTrailingComma: true,
			disallowComments: false
		});
		const ctxNode = root && this.findContextNode(root, text);
		if (!ctxNode) {
			return;
		}
	
		const bracePos = ctxNode.offset;
		const insertPos = doc.positionAt(bracePos + 1);
	
		const lineText = doc.getText({
			start: Position.create(insertPos.line, 0),
			end: insertPos
		});
		const indent = (/^[\s\t]*/.exec(lineText)?.[0]) || '';
	
		const snippet = `\n${indent}"${prefix}": "${iri}","`;
		return TextEdit.insert(insertPos, snippet);
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
