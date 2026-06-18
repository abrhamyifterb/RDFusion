/* eslint-disable @typescript-eslint/no-explicit-any */
import { Quad } from 'n3';
import { Range } from 'vscode-languageserver';
import type { JsonLdPredicateRangeMap } from '../id-range-builder';

function tokenFromRange(r: Range) {
	return {
		startLine:   r.start.line + 1,
		startColumn: r.start.character + 1,
		endLine:     r.end.line + 1,
		endColumn:   r.end.character + 1,
	};
}

export class QuadPositionAttacher {
	constructor(
		private idRanges: Map<string,Range>,
		private predicateRanges: JsonLdPredicateRangeMap = new Map(),
	) {}
	attach(quads: Quad[]): void {
		quads.forEach(q => {
			if (q.subject.termType !== 'NamedNode') return;

			const subjectRange = this.idRanges.get(q.subject.value);
			if (subjectRange) {
				(q as any).positionToken = tokenFromRange(subjectRange);
			}

			if (q.predicate.termType !== 'NamedNode') return;
			const predicateRange = this.predicateRanges
				.get(q.subject.value)
				?.get(q.predicate.value);
			if (predicateRange) {
				(q as any).predicatePositionToken = tokenFromRange(predicateRange);
			}
		});
	}
}
