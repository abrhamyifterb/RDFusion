import {
	CompletionItem,
	Connection,
	MarkupKind,
	TextDocumentPositionParams,
	TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseTree, type Node } from 'jsonc-parser';
import { ICompletionProvider } from '../icompletion-provider.js';
import { TermProvider } from './term-provider.js';
import { PrefixRegistry } from '../prefix/prefix-registry.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings.js';
import type { TermMetadata, TermMetadataService } from '../term-metadata/term-metadata-service.js';
import type { DataManager } from '../../../data/data-manager.js';
import type { JsonldParsedGraph } from '../../../data/irdf-parser.js';
import { findJsonLdContextValues, findJsonLdLocalContextAt, findJsonLdKeywordAliasesAt, jsonLdStateFromResolvedContext, jsonStringNodeValue, type JsonLdLocalContextState } from '../../../utils/shared/jsonld/context-prefix.js';
import {
	completionKindForSemanticRole,
	isClassOnlyTerm,
	isPropertyOnlyTerm,
	roleSortPrefix,
	termSemanticKind,
} from '../term-metadata/term-semantic-kind.js';

type JsonLdTermCompletionRole = 'predicate' | 'type' | 'none';

interface JsonLdTermCompletionQuery {
	prefix: string;
	fragment: string;
	namespaceIri?: string;
	detailPrefix: string;
}

function completionDetailPrefix(prefix: string): string {
	return prefix === '@vocab' ? '@vocab' : prefix;
}

function containsOffset(node: Node | undefined, offset: number): boolean {
	return !!node && offset >= node.offset && offset <= node.offset + node.length;
}

function isInsideContext(root: Node, text: string, node: Node): boolean {
	return findJsonLdContextValues(root, text).some(context => containsOffset(context, node.offset));
}

function valueContainsOffset(value: Node | undefined, offset: number): boolean {
	if (!value) return false;
	if (containsOffset(value, offset)) return true;
	return (value.children ?? []).some((child: Node) => valueContainsOffset(child, offset));
}

function resolveJsonLdCompletionRole(root: Node, text: string, offset: number, initialContext?: JsonLdLocalContextState): JsonLdTermCompletionRole {
	let role: JsonLdTermCompletionRole = 'none';
	

	const visit = (node: Node | undefined): void => {
		if (!node || role !== 'none') return;
		if (node.type === 'property') {
			const key = node.children?.[0];
			const value = node.children?.[1];
			const keyText = jsonStringNodeValue(text, key);
			if (containsOffset(key, offset)) {
				role = keyText !== '@context' && !isInsideContext(root, text, node) ? 'predicate' : 'none';
				return;
			}
			if ((keyText === '@type' || (keyText ? findJsonLdKeywordAliasesAt(root, text, '@type', value?.offset ?? offset, initialContext).has(keyText) : false)) && valueContainsOffset(value, offset)) {
				role = isInsideContext(root, text, node) ? 'none' : 'type';
				return;
			}
		}
		for (const child of node.children ?? []) visit(child);
	};

	visit(root);
	return role;
}

function roleScore(role: JsonLdTermCompletionRole, metadata?: TermMetadata): number {
	const kind = termSemanticKind(metadata);
	if (role === 'predicate') {
		if (kind === 'shacl-field') return 0;
		if (kind === 'property') return 1;
		if (kind === 'unknown') return 3;
		return 9;
	}
	if (role === 'type') {
		if (kind === 'class') return 0;
		if (kind === 'resource') return 1;
		if (kind === 'unknown') return 3;
		return 9;
	}
	return 9;
}

function shouldIncludeTermForRole(role: JsonLdTermCompletionRole, metadata?: TermMetadata): boolean {
	if (role === 'predicate') {
		return !isClassOnlyTerm(metadata);
	}
	if (role === 'type') {
		return !isPropertyOnlyTerm(metadata);
	}
	return false;
}

function roleDetailLabel(role: JsonLdTermCompletionRole, metadata?: TermMetadata): string {
	const kind = termSemanticKind(metadata);
	const semantic = kind === 'shacl-field' ? 'SHACL field'
		: kind === 'property' ? 'property'
		: kind === 'class' ? 'class'
		: kind === 'resource' ? 'resource'
		: 'term';
	return role === 'type' ? `${semantic} for @type` : `${semantic} for property key`;
}

function metadataRoleFor(role: JsonLdTermCompletionRole): 'predicate' | 'object' | 'unknown' {
	if (role === 'predicate') return 'predicate';
	if (role === 'type') return 'object';
	return 'unknown';
}


function contextDetail(term: string, iri: string | null | undefined, type?: string, container?: string[]): string {
	const parts = ['JSON-LD context term'];
	if (iri && !iri.startsWith('@')) parts.push(iri);
	else if (iri) parts.push(iri);
	if (type) parts.push(`@type ${type}`);
	if (container?.length) parts.push(`@container ${container.join(', ')}`);
	return `${term} — ${parts.join(' — ')}`;
}

function escapeCode(value: string): string {
	return `\`${value.replace(/`/g, "\\`")}\``;
}

function contextDocumentation(
	term: string,
	iri: string | null | undefined,
	type?: string,
	container?: string[],
): string {
	const lines = [`**${term}**`, '', '- **Metadata source:** JSON-LD context'];
	if (iri) lines.push(`- **IRI:** ${escapeCode(iri)}`);
	const jsonLd: string[] = [];
	if (type) jsonLd.push(`@type: ${escapeCode(type)}`);
	if (container?.length) {
		jsonLd.push(`@container: ${container.map(escapeCode).join(', ')}`);
	}
	if (jsonLd.length) lines.push(`- **JSON-LD:** ${jsonLd.join(', ')}`);
	return lines.join('\n');
}

export class JsonLdTermCompletionProvider implements ICompletionProvider {
	private configSettings: RDFusionConfigSettings;
	constructor(
		private termProvider: TermProvider,
		private registry: PrefixRegistry,
		private connection: Connection,
		initialSettings: RDFusionConfigSettings,
		private termMetadata?: TermMetadataService,
		private dataManager?: DataManager
	) {
		this.configSettings = initialSettings;
	}

	private async resolvedContextState(
		doc: TextDocument,
	): Promise<JsonLdLocalContextState> {
		try {
			const snapshot = this.dataManager
				? await this.dataManager.ensureCurrentSnapshot(
					doc.uri,
					doc.getText(),
					doc.version,
					doc.languageId,
				)
				: undefined;
			if (snapshot?.fileType !== 'jsonld' || snapshot.version !== doc.version) {
				return jsonLdStateFromResolvedContext(undefined);
			}
			return jsonLdStateFromResolvedContext(
				(snapshot.parsedGraph as JsonldParsedGraph).resolvedContext,
			);
		} catch {
			return jsonLdStateFromResolvedContext(undefined);
		}
	}

	private contextCompletionItems(
		role: JsonLdTermCompletionRole,
		fragment: string,
		active: JsonLdLocalContextState,
	): CompletionItem[] {
		const metadataRole = metadataRoleFor(role);
		const out: CompletionItem[] = [];
		for (const [term, def] of active.terms) {
			if (!term.startsWith(fragment)) continue;
			const iri = def['@id'];
			if (role === 'type' && (!iri || iri === '@id' || iri === '@type')) continue;
			if (role === 'predicate' && iri === '@id') continue;

			const metadata = iri && !iri.startsWith('@')
				? this.termMetadata?.getMetadataForIri?.(iri, {
					source: 'context',
					role: metadataRole,
					syntax: 'jsonld',
					displayName: term,
				})
				: undefined;
			if (metadata && !shouldIncludeTermForRole(role, metadata)) {
				continue;
			}

			const score = roleScore(role, metadata);
			const semanticKind = termSemanticKind(metadata);
			out.push({
				label: term,
				kind: completionKindForSemanticRole(metadataRole, metadata),
				insertText: term,
				detail: metadata?.detail ?? contextDetail(term, iri, def['@type'], def['@container']),
				documentation: metadata
					? this.termMetadata?.toMarkupContent(metadata)
					: {
						kind: MarkupKind.Markdown,
						value: contextDocumentation(term, iri, def['@type'], def['@container']),
					},
				sortText: `${roleSortPrefix(score)}_${semanticKind}_${term}`,
				data: {
					rdfusionContext: {
						role,
						semanticKind,
						prefix: '@context',
						fragment,
						iri,
					},
				},
			});
		}
		return out;
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

		const baseContext = await this.resolvedContextState(doc);

		const role = resolveJsonLdCompletionRole(root, text, offset, baseContext);
		if (role === 'none') {
			return [];
		}

		const localContext = findJsonLdLocalContextAt(root, text, offset, baseContext);
		const plainTermMatch = before.match(/\s*"([^"\\]*)$/);
		const contextItems = plainTermMatch
			? this.contextCompletionItems(role, plainTermMatch[1] ?? '', localContext)
			: [];

		const compactIriMatch = before.match(/\s*"([A-Za-z_][\w-]*):([\w-]*)?$/);
		let query: JsonLdTermCompletionQuery | undefined;
		if (compactIriMatch) {
			const [, prefix, fragment = ''] = compactIriMatch;
			const namespaceIri = localContext.hasContext
				? localContext.prefixMap.get(prefix)
				: this.registry.getIri(prefix);
			if (!namespaceIri) return [];
			query = { prefix, fragment, namespaceIri, detailPrefix: prefix };
		} else {
			const vocabTermMatch = before.match(/\s*"([A-Za-z_][\w-]*)$/);
			if (!vocabTermMatch) return contextItems.slice(0, 50);
			const vocab = localContext.vocab;
			if (!vocab) return contextItems.slice(0, 50);
			query = { prefix: '@vocab', fragment: vocabTermMatch[1] ?? '', namespaceIri: vocab, detailPrefix: '@vocab' };
		}

		const { prefix, fragment, namespaceIri, detailPrefix } = query;
		const terms = await this.termProvider.getTermsFor(prefix, this.connection, namespaceIri, 'jsonld');
		if (!terms.length && contextItems.length === 0) {
			return [];
		}

		const metadataRole = metadataRoleFor(role);
		const suggestions = terms
			.filter(t => t.startsWith(fragment))
			.slice(0, 200)
			.map(term => {
				const metadata = this.termMetadata?.getMetadata?.(prefix, term, {
					source: 'context',
					role: metadataRole,
					namespaceIri,
					syntax: 'jsonld',
				});
				if (!shouldIncludeTermForRole(role, metadata)) {
					return undefined;
				}
				const score = roleScore(role, metadata);
				const semanticKind = termSemanticKind(metadata);
				const item: CompletionItem = {
					label: term,
					kind: completionKindForSemanticRole(metadataRole, metadata),
					insertText: term,
					detail: `${roleDetailLabel(role, metadata)} from ${completionDetailPrefix(detailPrefix)}`,
					sortText: `${roleSortPrefix(score)}_${semanticKind}_${term}`,
					data: {
						rdfusionContext: {
							role,
							semanticKind,
							prefix,
							fragment,
						},
					},
				};
				return this.termMetadata?.enrichCompletionItem(item, prefix, term, {
					source: 'context',
					role: metadataRole,
					namespaceIri,
					syntax: 'jsonld',
				}) ?? item;
			})
			.filter((item): item is CompletionItem => !!item)
			.sort((a, b) => String(a.sortText ?? a.label).localeCompare(String(b.sortText ?? b.label)));

		const deduped = new Map<string, CompletionItem>();
		for (const item of [...contextItems, ...suggestions]) {
			if (!deduped.has(item.label)) deduped.set(item.label, item);
		}

		return Array.from(deduped.values())
			.sort((a, b) => String(a.sortText ?? a.label).localeCompare(String(b.sortText ?? b.label)))
			.slice(0, 50);
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
