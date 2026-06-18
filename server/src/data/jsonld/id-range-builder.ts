import { Node } from 'jsonc-parser';
import { Range } from 'vscode-languageserver';
import { Extractor } from '../../utils/shared/jsonld/iextractor';
import { childAt } from '../../utils/shared/jsonld/child-at';
import { rangeFromOffsets } from '../../utils/shared/jsonld/range-from-offsets';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

function jsonStringValue(text: string, node: Node | undefined): string | undefined {
	if (!node || node.type !== 'string') return undefined;
	try {
		return JSON.parse(text.slice(node.offset, node.offset + node.length));
	} catch {
		return text.slice(node.offset + 1, node.offset + node.length - 1);
	}
}

export type JsonLdPredicateRangeMap = Map<string, Map<string, Range>>;

export class IdRangeBuilder implements Extractor<Map<string,Range>> {
	constructor(
		private contextMap: Map<string,string>,
		private prefixMap: Map<string,string> = contextMap,
		private base?: string | null,
		private vocab?: string,
	) {}

	extract(ast: Node, text: string): Map<string,Range> {
		const map = new Map<string,Range>();
		const walk = (node: Node) => {
			if (node?.type === 'property') {
				const key = childAt(node, 0);
				const val = childAt(node, 1);
				const keyText = jsonStringValue(text, key);
				const idValue = jsonStringValue(text, val);
				if (keyText && idValue && this.isIdKey(keyText)) {
					map.set(
						this.expandIdValue(idValue),
						rangeFromOffsets(text, val!.offset + 1, val!.offset + val!.length - 1),
					);
				}
			}
			node.children?.forEach(walk);
		};
		walk(ast);
		return map;
	}

	extractPredicateRanges(ast: Node, text: string): JsonLdPredicateRangeMap {
		const map: JsonLdPredicateRangeMap = new Map();
		const walk = (node: Node) => {
			if (node?.type === 'object') {
				this.collectObjectPredicateRanges(node, text, map);
			}
			node.children?.forEach(walk);
		};
		walk(ast);
		return map;
	}

	private collectObjectPredicateRanges(node: Node, text: string, map: JsonLdPredicateRangeMap): void {
		const subject = this.subjectForObject(node, text);
		if (!subject) return;

		let ranges = map.get(subject);
		if (!ranges) {
			ranges = new Map<string, Range>();
			map.set(subject, ranges);
		}

		for (const prop of node.children ?? []) {
			if (prop.type !== 'property') continue;
			const key = childAt(prop, 0);
			const keyText = jsonStringValue(text, key);
			if (!key || !keyText || this.isIdKey(keyText)) continue;
			const predicate = this.expandPredicateKey(keyText);
			if (!predicate) continue;

			ranges.set(
				predicate,
				rangeFromOffsets(text, key.offset + 1, key.offset + key.length - 1),
			);
		}
	}

	private subjectForObject(node: Node, text: string): string | undefined {
		for (const prop of node.children ?? []) {
			if (prop.type !== 'property') continue;
			const keyText = jsonStringValue(text, childAt(prop, 0));
			const idValue = jsonStringValue(text, childAt(prop, 1));
			if (keyText && idValue && this.isIdKey(keyText)) {
				return this.expandIdValue(idValue);
			}
		}
		return undefined;
	}

	private isIdKey(key: string): boolean {
		return key === '@id' || this.contextMap.get(key) === '@id';
	}

	private expandPredicateKey(key: string): string | undefined {
		if (key === '@type' || this.contextMap.get(key) === '@type') {
			return RDF_TYPE;
		}
		if (key.startsWith('@')) return undefined;

		const mapped = this.contextMap.get(key);
		if (mapped) {
			return mapped.startsWith('@') ? undefined : mapped;
		}

		const colon = key.indexOf(':');
		if (colon > 0) {
			const prefix = key.slice(0, colon);
			const local = key.slice(colon + 1);
			const namespace = this.prefixMap.get(prefix);
			if (namespace) return `${namespace}${local}`;
			try { return new URL(key).toString(); }
			catch { return undefined; }
		}

		return this.vocab ? `${this.vocab}${key}` : undefined;
	}

	private expandIdValue(value: string): string {
		const colon = value.indexOf(':');
		if (colon > 0) {
			const prefix = value.slice(0, colon);
			const local = value.slice(colon + 1);
			const namespace = this.prefixMap.get(prefix);
			if (namespace) return `${namespace}${local}`;
			try { return new URL(value).toString(); }
			catch { return value; }
		}

		if (this.base) {
			try { return new URL(value, this.base).toString(); }
			catch { /* keep original value */ }
		}
		return value;
	}
}
