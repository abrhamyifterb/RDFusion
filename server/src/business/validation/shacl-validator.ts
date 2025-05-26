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


export class ShaclValidator {
	constructor(private shapeManager: ShapeManager) {}

	async validate(dataGraph: ParsedGraph | JsonldParsedGraph): Promise<Diagnostic[]> {
		const diagnostics: Diagnostic[] = [];
	
		const globalShapesArr = this.shapeManager.getGlobalShapes();
		if (globalShapesArr.length === 0) {
			return diagnostics;
		}
	
		const mergedShapes: ParsedGraph | JsonldParsedGraph = {
			quads: [],
			tokens: [],
			errors: []
		};
		for (const shapeGraph of globalShapesArr) {
			mergedShapes.quads.push(...shapeGraph.quads);
		}
	
		const dataDataset = rdfDataset.dataset();
		dataGraph.quads.forEach((quad: any) => dataDataset.add(quad));
	
		const shapesDataset = rdfDataset.dataset();
		mergedShapes.quads.forEach((quad: any) => shapesDataset.add(quad));
	
		try {
			const validator = new Validator(shapesDataset, { factory: rdfDataModel });
			const report = await validator.validate({ dataset: dataDataset });
			report.results.forEach((result: any) => {
				const matchingQuad = dataGraph.quads.find(q => q._subject.value === result.focusNode.value.trim());
				const diag = {
						range: (matchingQuad && matchingQuad.positionToken && matchingQuad.positionToken.startLine !== undefined) ? 
								Range.create(Position.create(matchingQuad.positionToken.startLine - 1, matchingQuad.positionToken.startColumn - 1), 
								Position.create(matchingQuad.positionToken.endLine - 1, matchingQuad.positionToken.endColumn)) :
								Range.create(Position.create(0, 0), Position.create(0, 1)),
						message: result.message && result.message[0] ? result.message[0].value : "SHACL shape violation",
						severity: DiagnosticSeverity.Warning,
						source: "SHACL Validation"
					};
					diagnostics.push(diag);
				});
			} catch (err: any) {
				diagnostics.push({
					range: Range.create(Position.create(0, 0), Position.create(0, 1)),
					message: `SHACL validation error: ${err.message}`,
					severity: DiagnosticSeverity.Error,
					source: "SHACL Validation"
				});
			}
	
		return diagnostics;
	}
}