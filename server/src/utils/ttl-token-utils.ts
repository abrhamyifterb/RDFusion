/* eslint-disable @typescript-eslint/no-explicit-any */
import { Range } from "vscode-languageserver/node.js";

export const LITERAL_TOKEN_TYPES: ReadonlySet<string> = new Set([
	"STRING_LITERAL_QUOTE",
	"INTEGER",
	"DECIMAL",
	"FLOAT",
]);

export function isLiteralToken(token: { type: string }): boolean {
	return LITERAL_TOKEN_TYPES.has(token.type);
}

export function tokenToRange(token: any): Range {
	return Range.create(
		(token.startLine || 1) - 1,
		(token.startColumn || 1) - 1,
		(token.endLine || token.startLine || 1) - 1,
		(token.endColumn || token.startColumn || 1) - 1
	);
}

export function buildPrefixMapping(tokens: any[]): Record<string, string> {
	const mapping: Record<string, string> = {};
	for (let i = 0; i < tokens?.length - 2; i++) {
		const t1 = tokens[i];
		const t2 = tokens[i + 1];
		const t3 = tokens[i + 2];
		if (
		t1.type === "TTL_PREFIX" &&
		t2.type === "PNAME_NS" &&
		t3.type === "IRIREF"
		) {
		const prefix = t2.image.replace(/:$/, "");
		const iri = t3.image.replace(/^<|>|\s+/g, "");
		mapping[prefix] = iri;
		i += 2;
		}
	}
	return mapping;
}

export function extractLiteralInfos(tokens: any[], prefixMapping: Record<string, string>): {
	value: string;
	datatype?: string;
	language?: string;
	range: Range;
}[] {
	const literals: any[] = [];
	for (let i = 0; i < tokens?.length; i++) {
		const token = tokens[i];
		if (isLiteralToken(token)) {
		const value = token.image;
		const range = tokenToRange(token);
		let datatype: string | undefined;
		let language: string | undefined;
		if (tokens[i + 1] && tokens[i + 1].type === "DoubleCaret") {
			if (tokens[i + 2]) {
				datatype = resolveDatatype(tokens[i + 2].image, prefixMapping);
				i += 2;
			}
		} else if (tokens[i + 1] && tokens[i + 1].type === "LANGTAG") {
			language = tokens[i + 1].image.replace(/^@/, "");
			i += 1;
		}
		literals.push({ value, datatype, language, range });
		}
	}
	return literals;
}

export function resolveDatatype(datatypeStr: string, prefixMapping: Record<string, string>): string {
	datatypeStr = datatypeStr.replace(/\s+/g, '');
	if (datatypeStr.startsWith("<") && datatypeStr.endsWith(">")) {
		return datatypeStr.slice(1, -1);
	}
	const parts = datatypeStr.split(":");
	if (parts.length === 2) {
		const [prefix, localPart] = parts;
		if (prefixMapping[prefix]) {
			return prefixMapping[prefix] + localPart;
		}
	}
	return datatypeStr;
}
