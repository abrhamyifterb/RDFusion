/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParsedGraph } from '../../../data/irdf-parser';
import { GroupFormatter } from '../grouping/turtle/group-by-subject';

export class SortFormatter {
	public async sortAndGroup(
		parsed: ParsedGraph,
		mode: string,
		direction: string
	): Promise<string> {
		const quads = parsed.quads.slice();
		const sortOrder = direction === 'asc' ? 1 : -1;
		
		const compareSubjects = (x: string, y: string): number => {
			const aBlank = x.startsWith('_:');
			const bBlank = y.startsWith('_:');
			if (aBlank !== bBlank) {
				return sortOrder * (aBlank ? 1 : -1);
			}
			return sortOrder * x.localeCompare(y);
		};

		if (mode === 'subject') {
			quads.sort((a, b) => {
				const sub = compareSubjects(a.subject.value, b.subject.value);
				if (sub !== 0) {
					return sub;
				}
				const pred = sortOrder * a.predicate.value.localeCompare(b.predicate.value);
				if (pred !== 0) {
					return pred;
				}
				return sortOrder * a.object.value.localeCompare(b.object.value);
			});
		} else {
			const bySubject = new Map<string, typeof quads[0][]>();
			for (const q of quads) {
				const key = q.subject.value;
				if (!bySubject.has(key)) {
					bySubject.set(key, []);
				}
				bySubject.get(key)!.push(q);
			}

			const subjectKeys = Array.from(bySubject.keys());
			// subjectKeys.sort((a, b) => compareSubjects(a, b));

			const sortedQuads: typeof quads = [];
			for (const sub of subjectKeys) {
				const group = bySubject.get(sub)!;
				group.sort((i, j) => {
				const pred = sortOrder * i.predicate.value.localeCompare(j.predicate.value);
				if (pred !== 0) {
					return pred;
				}
				return sortOrder * i.object.value.localeCompare(j.object.value);
				});
				sortedQuads.push(...group);
			}

			quads.splice(0, quads.length, ...sortedQuads);
		}

		const mergedPrefixes: Record<string, string> = 'prefixes' in parsed && parsed.prefixes ? { ...parsed.prefixes } : {};

		for (const [pfx, ns] of Object.entries(mergedPrefixes)) {
			if (!ns.endsWith('/') && !ns.endsWith('#')) {
				mergedPrefixes[pfx] = ns + '/';
			}
		}

		const combined: ParsedGraph = {
			quads,
			prefixes: mergedPrefixes,
			tokens: []
		};

		return new GroupFormatter().group(combined);
	}
}
