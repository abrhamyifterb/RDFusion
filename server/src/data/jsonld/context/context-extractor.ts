import { Node } from 'jsonc-parser';
import { Extractor } from '../../../utils/shared/jsonld/iextractor';
import { findJsonLdContextObjects, jsonStringNodeValue } from '../../../utils/shared/jsonld/context-prefix';

function valueAsStringOrId(text: string, value: Node | undefined): string | undefined {
	if (value?.type === 'string') {
		return jsonStringNodeValue(text, value);
	}
	if (value?.type === 'object') {
		for (const prop of value.children ?? []) {
			if (prop.type !== 'property') continue;
			if (jsonStringNodeValue(text, prop.children?.[0]) === '@id') {
				return jsonStringNodeValue(text, prop.children?.[1]);
			}
		}
	}
	return undefined;
}

export class ContextExtractor implements Extractor<Map<string,string>> {
	extract(ast: Node, text: string): Map<string,string> {
		const map = new Map<string,string>();
		for (const context of findJsonLdContextObjects(ast, text)) {
			for (const entry of context.children ?? []) {
				if (entry.type !== 'property') continue;
				const term = jsonStringNodeValue(text, entry.children?.[0]);
				if (!term || term.startsWith('@')) continue;
				const iri = valueAsStringOrId(text, entry.children?.[1]);
				if (iri !== undefined) {
					map.set(term, iri);
				}
			}
		}
		return map;
	}
}
