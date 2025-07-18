/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	CompletionItem,
	CompletionItemKind,
	InsertTextFormat,
	TextDocumentPositionParams,
	TextDocuments,
	Connection,
	TextEdit,
	Position
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Node, parseTree } from "jsonc-parser";
import { PrefixRegistry } from "../prefix-registry.js";
import { RDFusionConfigSettings } from '../../../../utils/irdfusion-config-settings.js';

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
	
		const ctxNode = this.findContextNode(root, text);
		if (!ctxNode) {
			return [];
		}
	
		const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
		const before    = text.substring(lineStart, offset);
	
		const inContext = offset > ctxNode.offset
						&& offset <= ctxNode.offset + ctxNode.length;
	
		const justQuote = inContext && /^\s*"$/.test(before);

		const usageMatch = before.match(/\s*"([A-Za-z_]\w*)(?::([\w-]*)?)?$/);
	
		const used = new Set<string>();
		for (const prop of ctxNode.children || []) {
			if (prop.type === "property" && prop.children) {
				try {
					const key = JSON.parse(
						text.slice(
							prop.children[0].offset,
							prop.children[0].offset + prop.children[0].length
						)
					);
					used.add(key);
				} catch (err: any) { 
					console.log(`Something went wrong: ${err.message}`); 
				}
			}
		}

		const declareOnColon = before.match(/\s*"([A-Za-z_]\w*):"?$/);
		if (!inContext && declareOnColon) {
			const prefix = declareOnColon[1];
			if (!used.has(prefix)) {
				const iri = await this.registry.ensure(prefix);
				if (iri) {
					const edit = this.makeContextInsertEdit(doc, uri, prefix, iri);
					if (edit) {
						this.connection.workspace.applyEdit({
							changes: { [uri]: [ edit ] }
						});
					}
				}
			}
			return [];
		}
	
		const all = this.registry.getAll().filter(e => !used.has(e.prefix));
		const suggestions: CompletionItem[] = [];

		if (inContext && justQuote) {
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
	
		if (usageMatch) {
			const [, prefix, local] = usageMatch;
			for (const { prefix: pfx, iri } of all) {
			if (!pfx.startsWith(prefix)) {continue;}
	
			const item = CompletionItem.create(`"${pfx}:${local ?? ""}"`);
			item.kind             = CompletionItemKind.Module;
			item.detail           = iri;
			item.insertTextFormat = InsertTextFormat.Snippet;
			item.insertText       = local == null ? `${pfx}:` : `${pfx}:${local}`;
			item.documentation    = `\`${pfx}:\` → \`${iri}\``;
	
			if (!used.has(pfx)) {
				const edit = this.makeContextInsertEdit(doc, uri, pfx, iri);
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
		uri: string,
		prefix: string,
		iri: string
	): TextEdit|undefined {
		const text = doc.getText();
		const root = parseTree(text, [], {
			allowTrailingComma: true,
			disallowComments:   false
		});
		const ctxNode = root && this.findContextNode(root, text);
		if (!ctxNode) {return;}
	
		const bracePos = ctxNode.offset;
		const insertPos = doc.positionAt(bracePos + 1);
	
		const lineText = doc.getText({
			start: Position.create(insertPos.line, 0),
			end:   insertPos
		});
		const indent = /^[\s\t]*/.exec(lineText)?.[0] ?? "";
	
		const snippet = `\n${indent}"${prefix}": "${iri}",`;
		return TextEdit.insert(insertPos, snippet);
	}

	private findContextNode(root: Node, text: string): Node|undefined {
		const stack: Node[] = [root];
		while (stack.length) {
			const n = stack.pop()!;
			if (
				n.type === "property" &&
				Array.isArray(n.children) &&
				n.children.length >= 2 &&
				n.children[0].type === "string"
			) {
			let key: string|null = null;
			try {
				key = JSON.parse(
				text.slice(
					n.children[0].offset,
					n.children[0].offset + n.children[0].length
				)
				);
			} catch (err: any) { 
				console.log(`Something went wrong: ${err.message}`); 
			}
			if (key === "@context") {
				return n.children[1];
			}
			}
			if (n.children) {
				stack.push(...n.children);
			}
		}
		return undefined;
	}
}