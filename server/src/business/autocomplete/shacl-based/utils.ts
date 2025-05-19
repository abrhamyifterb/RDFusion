import { ParsedGraph }                from '../../../data/irdf-parser';

export function collectUsedPredicates(
	docText: string,
	parsed:  ParsedGraph,
	subjectIri: string,
	declOffset: number,
	cursorOffset: number
): Set<string> {
  const used = new Set<string>();

  for (const q of parsed.quads) {
    if (q.subject.value === subjectIri) {
      used.add(q.predicate.value);
    }
  }

  for (const t of parsed.tokens) {
    if (t.offset < declOffset || t.offset > cursorOffset) continue;
    if (t.type !== 'iri' && t.type !== 'prefixedName') continue;

    let iri: string|undefined;
    if (t.type === 'iri') {
      iri = t.value.slice(1, -1);
    } else {
      const [pfx, local] = t.value.split(':',2);
      const base = parsed.prefixes?.[pfx];
      if (base) iri = base + local;
    }
    if (iri && iri !== subjectIri && !used.has(iri)) {
      used.add(iri);
    }
  }

  return used;
}

