/* eslint-disable @typescript-eslint/no-explicit-any */
import { Quad } from 'n3';
import { GroupFormatter } from '../../grouping/turtle/group-by-subject';
import { ParsedGraph } from '../../../../data/irdf-parser';

function usedPrefixes(
	quads: Quad[],
	prefixes: Record<string,string> = {}
): Record<string,string> {
	const used = new Set<string>();
	for (const q of quads) {
		const record = (iri: string) => {
			for (const [pfx, base] of Object.entries(prefixes)) {
				if (iri.startsWith(base)) {
					used.add(pfx);
				}
			}
		};

		record(q.subject.value);
		record(q.predicate.value);
		
		if (q.object.termType === 'NamedNode') {
			record(q.object.value);
		} else if (q.object.termType === 'Literal') {
			const dt = (q.object as any).datatype?.value;
			if (dt) {record(dt);}
		}
	}
	const usedPrefixes: Record<string,string> = {};
	for (const pfx of used) {
		usedPrefixes[pfx] = prefixes[pfx];
	}
	return usedPrefixes;
}

export class TurtleFilterCommand {
	constructor() {}

	public filter(quads: Quad[], prefixes: Record<string,string>): string {
		const filteredPrefixes = usedPrefixes(quads, prefixes);
		const fragment: ParsedGraph = { quads, prefixes: filteredPrefixes, tokens: [] };
		return new GroupFormatter().group(fragment);
	}
}