export const term = (t: any) => String((t && t.value) ?? t);
export const iri  = (q: any, which: 's'|'p'|'o') =>
  which === 's' ? term(q.subject) : which === 'p' ? term(q.predicate) : term(q.object);
