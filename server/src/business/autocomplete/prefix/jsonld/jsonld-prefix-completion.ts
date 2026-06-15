/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	CompletionItem,
	CompletionItemKind,
	InsertTextFormat,
	TextDocumentPositionParams,
	TextDocuments,
	Connection,
	TextEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Node, parseTree } from "jsonc-parser";
import { PrefixRegistry } from "../prefix-registry.js";
import { RDFusionConfigSettings } from '../../../../utils/irdfusion-config-settings.js';
import {
	buildJsonLdPrefixContextEdits,
	collectJsonLdContextPrefixesAt,
	findJsonLdContextNodeAt,
} from '../../../../utils/shared/jsonld/context-edit.js';

export class JsonLdPrefixCompletionProvider {
	private configSettings: RDFusionConfigSettings;
	constructor(
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
		const uri    = params.textDocument.uri;
		const doc    = documents.get(uri);
		if (!doc) {return [];}
	
		const text   = doc.getText();
		const offset = doc.offsetAt(params.position);
		const root   = parseTree(text, [], {
			allowTrailingComma: true,
			disallowComments:   false
		});
		if (!root) {
			return [];
		}
	
		const ctxNode = findJsonLdContextNodeAt(root, text, offset, 'nearest')
			?? findJsonLdContextNodeAt(root, text, offset, 'root');
	
		const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
		const before    = text.substring(lineStart, offset);
	
		const inContext = !!ctxNode
			&& offset > ctxNode.offset
			&& offset <= ctxNode.offset + ctxNode.length;
	
		const justQuote = inContext && /^\s*"$/.test(before);

		const usageMatch = before.match(/\s*"([A-Za-z_]\w*)(?::([\w-]*)?)?$/);
	
		const used = collectJsonLdContextPrefixesAt(root, text, offset);

		const declareOnColon = before.match(/\s*"([A-Za-z_]\w*):"?$/);
		if (!inContext && declareOnColon && this.prefixDeclarationEnabled()) {
			const prefix = declareOnColon[1];
			if (!used.has(prefix)) {
				const iri = await this.registry.ensure(prefix);
				if (iri) {
					const edit = this.makeContextInsertEdit(doc, root, offset, prefix, iri);
					if (edit) {
						this.connection.workspace.applyEdit({
							changes: { [uri]: [ edit ] }
						});
					}
				}
			}
			//return [];
		}
	
		const all = this.registry.getAll().filter(e => !used.has(e.prefix));
		const suggestions: CompletionItem[] = [];

		if (ctxNode && inContext && justQuote && (ctxNode.type === 'object' || ctxNode.type === 'array')) {
			for (const { prefix, iri } of all) {
				const item = CompletionItem.create(`"${prefix}"`);
				item.kind             = CompletionItemKind.Module;
				item.detail           = iri;
				item.insertTextFormat = InsertTextFormat.Snippet;
				item.insertText       = `${prefix}": "${iri}",`;
				item.documentation    = `Add \`"${prefix}"\` → \`${iri}\` to @context`;
				suggestions.push(item);

				if (suggestions.length >= 20) {break;}
			}
			return suggestions;
		}
	
		if (usageMatch && ctxNode?.type !== 'string') {
			const [, prefix, local] = usageMatch;
			for (const { prefix: pfx, iri } of all) {
			if (!pfx.startsWith(prefix)) {continue;}
	
			const item = CompletionItem.create(`"${pfx}:${local ?? ""}"`);
			item.kind             = CompletionItemKind.Module;
			item.detail           = iri;
			item.insertTextFormat = InsertTextFormat.Snippet;
			item.insertText       = local == null ? `${pfx}:` : `${pfx}:${local}`;
			item.documentation    = `\`${pfx}:\` → \`${iri}\``;
	
			if (this.prefixDeclarationEnabled() && !used.has(pfx)) {
				const edit = this.makeContextInsertEdit(doc, root, offset, pfx, iri);
				if (edit) {
				item.additionalTextEdits = [edit];
				}
			}
	
			suggestions.push(item);
			if (suggestions.length >= 20) {break;}
			}
		}

		return suggestions;
	}

	private makeContextInsertEdit(
		doc: TextDocument,
		root: Node,
		offset: number,
		prefix: string,
		iri: string
	): TextEdit|undefined {
		return buildJsonLdPrefixContextEdits(doc, root, prefix, iri, offset, 'nearest')[0];
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}

	private prefixDeclarationEnabled(): boolean {
		return this.configSettings.jsonld?.autocomplete?.['prefixDeclaration'] !== false;
	}
}
