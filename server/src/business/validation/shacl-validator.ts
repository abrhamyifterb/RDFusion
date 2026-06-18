/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Diagnostic,
	DiagnosticSeverity,
	Range,
	Position,
} from "vscode-languageserver/node.js";
import rdfDataset from "@rdfjs/dataset";
import rdfDataModel from "@rdfjs/data-model";

import Validator from 'shacl-engine/Validator.js';
import { ShapeManager } from '../../data/shacl/shape-manager';
import { JsonldParsedGraph, ParsedGraph } from '../../data/irdf-parser';
import { DEFAULT_SHACL_SELECTION, ShaclSelectionSettings } from '../../data/shacl/shacl-selection';

function quadSubjectValue(q: any): string | undefined {
	return q?.subject?.value ?? q?._subject?.value;
}

function quadPredicateValue(q: any): string | undefined {
	return q?.predicate?.value ?? q?._predicate?.value;
}

function termValue(term: any): string | undefined {
	if (!term) return undefined;
	if (Array.isArray(term)) {
		for (const item of term) {
			const value = termValue(item);
			if (value) return value;
		}
		return undefined;
	}
	if (typeof term === 'string') {
		const value = term.trim();
		return value || undefined;
	}
	const directValue = term?.value;
	if (typeof directValue === 'string') {
		const value = directValue.trim();
		if (value) return value;
	}
	return termValue(term?.term ?? term?.node ?? term?.id ?? term?.object);
}

function resultTermValue(result: any, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = termValue(result?.[key]);
		if (value) return value;
	}
	return undefined;
}

function tokenToRange(token: any): Range | undefined {
	if (token?.startLine === undefined) return undefined;
	return Range.create(
		Position.create(token.startLine - 1, token.startColumn - 1),
		Position.create(token.endLine - 1, token.endColumn),
	);
}

function jsonLdSourceMapRange(
	dataGraph: ParsedGraph | JsonldParsedGraph,
	focus: string | undefined,
	path: string | undefined,
): Range | undefined {
	if (!focus) return undefined;
	const sourceMap = (dataGraph as JsonldParsedGraph).sourceMap;
	if (!sourceMap) return undefined;
	if (path) {
		const predicateRange = sourceMap.predicateRanges?.get(focus)?.get(path);
		if (predicateRange) return predicateRange;
	}
	return sourceMap.subjectRanges?.get(focus);
}

function firstJsonLdSourceMapRange(dataGraph: ParsedGraph | JsonldParsedGraph): Range | undefined {
	const sourceMap = (dataGraph as JsonldParsedGraph).sourceMap;
	for (const range of sourceMap?.subjectRanges?.values?.() ?? []) {
		return range;
	}
	for (const ranges of sourceMap?.predicateRanges?.values?.() ?? []) {
		for (const range of ranges.values()) {
			return range;
		}
	}
	return undefined;
}

function firstQuadRange(dataGraph: ParsedGraph | JsonldParsedGraph): Range | undefined {
	for (const quad of dataGraph.quads ?? []) {
		const range = tokenToRange((quad as any).positionToken)
			?? tokenToRange((quad as any).predicatePositionToken);
		if (range) return range;
	}
	return undefined;
}

function rangeFromOffsets(text: string, start: number, end: number): Range {
	let line = 0;
	let character = 0;
	let startPosition: Position | undefined;
	let endPosition: Position | undefined;
	for (let index = 0; index <= text.length; index += 1) {
		if (index === start) {
			startPosition = Position.create(line, character);
		}
		if (index === end) {
			endPosition = Position.create(line, character);
			break;
		}
		const char = text[index];
		if (char === '\n') {
			line += 1;
			character = 0;
		} else {
			character += 1;
		}
	}
	return Range.create(
		startPosition ?? Position.create(0, 0),
		endPosition ?? startPosition ?? Position.create(0, 1),
	);
}

function quotedJsonStringRange(text: string, quotedStart: number, quotedText: string): Range {
	return rangeFromOffsets(text, quotedStart + 1, quotedStart + quotedText.length - 1);
}

function jsonStringLiteralPattern(value: string): RegExp {
	const escaped = JSON.stringify(value)
		.slice(1, -1)
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`"${escaped}"`, 'u');
}

function exactJsonLdStringValueRange(
	dataGraph: ParsedGraph | JsonldParsedGraph,
	value: string | undefined,
): Range | undefined {
	if (!value || typeof (dataGraph as JsonldParsedGraph).text !== 'string') {
		return undefined;
	}
	const text = (dataGraph as JsonldParsedGraph).text;
	const quoted = JSON.stringify(value);
	const quotedIndex = text.indexOf(quoted);
	if (quotedIndex >= 0) {
		return quotedJsonStringRange(text, quotedIndex, quoted);
	}

	const literalMatch = jsonStringLiteralPattern(value).exec(text);
	if (literalMatch?.index !== undefined) {
		return quotedJsonStringRange(text, literalMatch.index, literalMatch[0]);
	}

	const rawIndex = text.indexOf(value);
	if (rawIndex >= 0) {
		return rangeFromOffsets(text, rawIndex, rawIndex + value.length);
	}
	return undefined;
}

function firstJsonLdIdValueRange(dataGraph: ParsedGraph | JsonldParsedGraph): Range | undefined {
	if (typeof (dataGraph as JsonldParsedGraph).text !== 'string') {
		return undefined;
	}
	const text = (dataGraph as JsonldParsedGraph).text;
	const match = /"@id"\s*:\s*("(?:\\.|[^"\\])*")/u.exec(text);
	if (!match || !match[1]) {
		return undefined;
	}
	const quotedIndex = text.indexOf(match[1], match.index);
	return quotedIndex >= 0 ? quotedJsonStringRange(text, quotedIndex, match[1]) : undefined;
}

function fallbackDiagnosticRange(dataGraph: ParsedGraph | JsonldParsedGraph): Range {
	return firstJsonLdIdValueRange(dataGraph)
		?? firstJsonLdSourceMapRange(dataGraph)
		?? firstQuadRange(dataGraph)
		?? Range.create(Position.create(0, 0), Position.create(0, 1));
}

function isRdfJsTerm(term: any): boolean {
	return !!term && typeof term === 'object' && typeof term.termType === 'string' && 'value' in term;
}

function isQuadLike(quad: any): boolean {
	return isRdfJsTerm(quad?.subject)
		&& isRdfJsTerm(quad?.predicate)
		&& isRdfJsTerm(quad?.object)
		&& (!quad?.graph || isRdfJsTerm(quad.graph));
}

export class ShaclValidator {
	constructor(private shapeManager: ShapeManager) {}

	async validate(dataGraph: ParsedGraph | JsonldParsedGraph, selection: ShaclSelectionSettings = DEFAULT_SHACL_SELECTION): Promise<Diagnostic[]> {
		const diagnostics: Diagnostic[] = [];
		const selectedShapes: any[] = typeof (this.shapeManager as any).getSelectedShapes === 'function'
			? (this.shapeManager as any).getSelectedShapes(selection)
			: this.shapeManager.getGlobalShapes();
		if (selectedShapes.length === 0) {
			return diagnostics;
		}

		const shapeQuads = selectedShapes.flatMap(shape => shape.quads).filter(isQuadLike);
		if (shapeQuads.length === 0) {
			return diagnostics;
		}

		const dataDataset = rdfDataset.dataset();
		for (const quad of (dataGraph.quads ?? []).filter(isQuadLike)) {
			dataDataset.add(quad);
		}

		if (dataDataset.size === 0) {
			return diagnostics;
		}

		const shapesDataset = rdfDataset.dataset();
		for (const quad of shapeQuads) {
			shapesDataset.add(quad);
		}

		try {
			const validator = new Validator(shapesDataset, { factory: rdfDataModel });
			const report = await validator.validate({ dataset: dataDataset });
			for (const result of report.results ?? []) {
				const focus = resultTermValue(result, ['focusNode', 'focus', 'sh:focusNode']);
				const path = resultTermValue(result, ['path', 'resultPath', 'sh:resultPath']);
				const firstMessage: any = result.message?.[0];
				const quads = dataGraph.quads ?? [];
				const propertyQuad = path
					? quads.find((q: any) =>
						quadSubjectValue(q) === focus
						&& quadPredicateValue(q) === path
						&& (q as any).predicatePositionToken,
					)
					: undefined;
				const matchingQuad = propertyQuad
					?? quads.find((q: any) => quadSubjectValue(q) === focus);
				const pathRange = path ? jsonLdSourceMapRange(dataGraph, focus, path) : undefined;
				const subjectRange = jsonLdSourceMapRange(dataGraph, focus, undefined);
				const range = tokenToRange((propertyQuad as any)?.predicatePositionToken)
					?? pathRange
					?? exactJsonLdStringValueRange(dataGraph, focus)
					?? tokenToRange((matchingQuad as any)?.positionToken)
					?? subjectRange
					?? fallbackDiagnosticRange(dataGraph);

				diagnostics.push({
					range,
					message: (typeof firstMessage === 'string' ? firstMessage : firstMessage?.value) ?? "SHACL shape violation",
					severity: DiagnosticSeverity.Warning,
					source: "SHACL Validation"
				});
			}
		} catch {
			diagnostics.push({
				range: fallbackDiagnosticRange(dataGraph),
				message: `SHACL validation could not be completed. Check that the selected SHACL shape files are valid and match the RDF file being validated.`,
				severity: DiagnosticSeverity.Error,
				source: "SHACL Validation"
			});
		}

		return diagnostics;
	}
}
