/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Connection, TextEdit, Range, Position, TextDocuments
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { parse } from 'jsonc-parser';
import * as jsonld from 'jsonld';

import { JsonldParsedGraph } from '../../../../data/irdf-parser';
import { DataManager } from '../../../../data/data-manager';
import { PrefixRegistry } from '../../../autocomplete/prefix/prefix-registry';
import { getSharedDocumentLoader } from '../../../../data/jsonld/auto-document-loader';

export class JsonLdDifferentModesCommand {
	constructor(
		private dataManager: DataManager,
		private connection:  Connection,
		private documents:   TextDocuments<TextDocument>,
		private registry: PrefixRegistry
	) {}

	public async execute(args: { uri: string; mode: string }): Promise<void> {
		try {
		const { uri } = args;
		const parsed = this.dataManager.getParsedData(uri) as JsonldParsedGraph | undefined;
		if (!parsed) {
			this.connection.console.error(`[JSON-LD Formatting] No parsed data for ${uri}`);
			return;
		}

		const doc = this.documents.get(uri);
		if (!doc) return;

		const text = doc.getText();
		const inputJson = parse(text, [], { allowTrailingComma: true, disallowComments: false });

		const mode = (args.mode || '').toLowerCase();
		let formattedText = '';
		const documentLoader = getSharedDocumentLoader();
		
		switch (mode) {
			case 'expand': {
			const out = await jsonld.expand(inputJson, { documentLoader });
			formattedText = JSON.stringify(out, null, 2);
			break;
			}
			case 'flatten': {
			const out = await jsonld.flatten(inputJson);
			formattedText = JSON.stringify(out, null, 2);
			break;
			}
			case 'compact': {
				let context: any = inputJson?.['@context'];

				if (!context) {
					context = { '@context': buildContextFromRegistry(parsed, this.registry) };
				} else if (typeof context === 'object' && !Array.isArray(context)) {
					const regCtx = buildContextFromRegistry(parsed, this.registry);
					context = { '@context': { ...regCtx, ...context } };
				} else {
					context = { '@context': context };
				}

				const out = await jsonld.compact(inputJson, context, { compactArrays: true, documentLoader });
				formattedText = JSON.stringify(out, null, 2);
				break;
			}
			default: {
				console.warn(`[JSON-LD Formatting] Unknown mode "${args.mode}". Use "expand", "compact", or "flatten".`);
				return;
			}
		}

		const lastLine = Math.max(0, doc.lineCount - 1);
		const lastCol  = doc.getText().split('\n').pop()!.length;
		const fullRange: Range = {
			start: Position.create(0, 0),
			end:   Position.create(lastLine, lastCol)
		};

		await this.connection.workspace.applyEdit({
			changes: { [uri]: [TextEdit.replace(fullRange, formattedText)] }
		});

		} catch (error: any) {
			console.error(`[JSON-LD Formatting] Failed: ${error.message || String(error)}`);
			return;
		}
	}
}

function iriNamespace(iri: string): string {
	const hash = iri.lastIndexOf('#');
	const slash = iri.lastIndexOf('/');
	const cut = Math.max(hash, slash);
	return cut >= 0 ? iri.slice(0, cut + 1) : iri; 
	}

	function buildContextFromRegistry(
		parsed: { contextMap?: Map<string, string> | Record<string, string> | undefined },
		registry: { getAll(): { prefix: string; iri: string }[] }
	): Record<string, string> {
	const ctxObj: Record<string, string> = {};

	const reg = registry.getAll();
	const nsToPrefix = new Map<string, string>();
	for (const r of reg) {
		if (!nsToPrefix.has(r.iri)) nsToPrefix.set(r.iri, r.prefix);
	}

	const entries: [string, string][] = [];
	if (parsed.contextMap) {
		if (parsed.contextMap instanceof Map) {
		for (const [term, iri] of parsed.contextMap.entries()) entries.push([term, iri]);
		} else {
		for (const term of Object.keys(parsed.contextMap)) entries.push([term, (parsed.contextMap as any)[term]]);
		}
	}

	const seenNs = new Set<string>();
	for (const [, iri] of entries) {
		if (typeof iri !== 'string') continue;
		seenNs.add(iriNamespace(iri));
	}

	const claimedPrefixes = new Set<string>();
	for (const ns of seenNs) {
		const pref = nsToPrefix.get(ns);
		if (pref && !claimedPrefixes.has(pref) && !Object.prototype.hasOwnProperty.call(ctxObj, pref)) {
		ctxObj[pref] = ns;
		claimedPrefixes.add(pref);
		}
	}

	for (const [term, iri] of entries) {
		const ns = typeof iri === 'string' ? iriNamespace(iri) : '';
		const hasReg = ns && nsToPrefix.has(ns);
		if (!hasReg) {
			if (term !== '@context' && term !== '@vocab' && term !== '@base' && !ctxObj[term]) {
				ctxObj[term] = iri;
			}
		}
	}
	return ctxObj;
}
