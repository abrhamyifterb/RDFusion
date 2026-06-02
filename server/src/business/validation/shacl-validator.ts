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
				const focus = result.focusNode?.value?.trim();
				const firstMessage: any = result.message?.[0];
				const matchingQuad = (dataGraph.quads ?? []).find((q: any) => quadSubjectValue(q) === focus);
				diagnostics.push({
					range: (matchingQuad?.positionToken?.startLine !== undefined) ?
						Range.create(
							Position.create(matchingQuad.positionToken.startLine - 1, matchingQuad.positionToken.startColumn - 1),
							Position.create(matchingQuad.positionToken.endLine - 1, matchingQuad.positionToken.endColumn)
						) :
						Range.create(Position.create(0, 0), Position.create(0, 1)),
					message: (typeof firstMessage === 'string' ? firstMessage : firstMessage?.value) ?? "SHACL shape violation",
					severity: DiagnosticSeverity.Warning,
					source: "SHACL Validation"
				});
			}
		} catch {
			diagnostics.push({
				range: Range.create(Position.create(0, 0), Position.create(0, 1)),
				message: `SHACL validation could not be completed. Check that the selected SHACL shape files are valid and match the RDF file being validated.`,
				severity: DiagnosticSeverity.Error,
				source: "SHACL Validation"
			});
		}

		return diagnostics;
	}
}
