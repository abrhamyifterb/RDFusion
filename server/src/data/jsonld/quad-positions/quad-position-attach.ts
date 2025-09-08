/* eslint-disable @typescript-eslint/no-explicit-any */
import { Quad } from 'n3';
import { Range } from 'vscode-languageserver';

export class QuadPositionAttacher {
	constructor(private idRanges: Map<string,Range>) {}
	attach(quads: Quad[]): void {
		quads.forEach(q => {
			if (q.subject.termType === 'NamedNode') {
				const r = this.idRanges.get(q.subject.value);
				if (r) {
					(q as any).positionToken = {
						startLine:   r.start.line + 1,
						startColumn: r.start.character + 1,
						endLine:     r.end.line + 1,
						endColumn:   r.end.character + 1,
					};
				}
			}
		});
	}
}