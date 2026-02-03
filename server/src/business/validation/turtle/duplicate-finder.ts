/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Diagnostic,
	DiagnosticSeverity,
	Range,
	Position,
} from "vscode-languageserver/node.js";
import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';

export class DuplicateChecker {
	constructor() {}

	public async validate(
		parsed: ParsedGraph | JsonldParsedGraph
	): Promise<Diagnostic[]> {
		const diagnostics: Diagnostic[] = [];
		const quads = parsed.quads;
		if (!quads || quads.length === 0) {
			return diagnostics;
		}
	
		const map = new Map<string, any[]>();
		for (const q of quads) {
			const lang = q.object.language ? `@${q.object.language}` : "";
			const dt = q.object.datatype?.value ? `^^${q.object.datatype.value}` : "";
			const key = `${q.subject.value}|${q.predicate.value}|${q.object.value}|${lang}${lang ? "" : dt}`;
			const arr = map.get(key) || [];
			arr.push(q);
			map.set(key, arr);
		}
	
		const duplicateGroups = Array.from(map.values()).filter(
			(group) => group.length > 1
		);
		
		for (const group of duplicateGroups) {
			for (const q of group) {
				if (!q.positionToken) {	continue; }
		
				const otherPositions = group
					.filter((r) => r !== q && r.positionToken)
					.map((r) => {
						const { startLine } = r.positionToken;
						return `${startLine}`;
					})
					.join(", ");
				
				const spo = `${q.subject.value} ${q.predicate.value} ${q.object.value} .`;
				const message = otherPositions
					? `Duplicate triple "${spo}" also at line ${otherPositions}`
					: `Duplicate triple`;
		
				const { startLine, startColumn, endLine, endColumn } = q.positionToken;
				diagnostics.push({
					range: Range.create(
						Position.create(startLine - 1, startColumn - 1),
						Position.create(endLine - 1, endColumn - 1)
					),
					message,
					severity: DiagnosticSeverity.Warning,
					source: "RDFusion",
				});
			}
		}
	
		return diagnostics;
	}
}
