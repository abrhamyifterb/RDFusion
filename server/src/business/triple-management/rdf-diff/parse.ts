/* eslint-disable @typescript-eslint/no-explicit-any */
import { Parser as N3Parser, Writer as N3Writer, Quad } from 'n3';
import { GraphData, Term, Triple } from './types';

export async function turtleToNQuads(ttl: string, baseIRI: string): Promise<string> {
  const parser = new N3Parser({ baseIRI, format: 'text/turtle' });
  const quads = parser.parse(ttl ?? '');
  const writer = new N3Writer({ format: 'N-Quads' });
  writer.addQuads(quads);
  return await new Promise<string>((resolve, reject) =>
    writer.end((err, out) => err ? reject(err) : resolve(out || ''))
  );
}

function quadTermToTerm(qt: Quad['subject'] | Quad['object'] | Quad['graph']): Term {
  if (qt.termType === 'BlankNode') {return { kind: 'bnode', value: qt.value };}
  if (qt.termType === 'NamedNode') {return { kind: 'iri', value: qt.value };}
  if (qt.termType === 'DefaultGraph') {return { kind: 'iri', value: '' };}
  if (qt.termType === 'Literal') {
    const lang = qt.language || undefined;
    const datatype = qt.datatype && qt.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string'
      ? qt.datatype.value : undefined;
    return { kind: 'literal', value: qt.value, lang, datatype };
  }
  return { kind: 'iri', value: qt.value ?? '' };
}

export function parseNQuadsToGraph(nquads: string): GraphData {
  const parser = new N3Parser({ format: 'N-Quads' });
  const quads = parser.parse(nquads ?? '');
  const triples: Triple[] = [];
  const bnodes = new Set<string>();

  quads.forEach(q => {
    const s = quadTermToTerm(q.subject);
    const p = (q.predicate as any).value as string;
    const o = quadTermToTerm(q.object);
    const g = q.graph && q.graph.termType !== 'DefaultGraph' ? quadTermToTerm(q.graph) : null;
    if (s.kind === 'bnode') {bnodes.add(s.value);}
    if (o.kind === 'bnode') {bnodes.add(o.value);}
    if (g && g.kind === 'bnode') {bnodes.add(g.value);}
    triples.push({ s, p, o, g });
  });

  return { triples, bnodes };
}

export function graphToSortedLines(g: GraphData): string[] {
  const lines: string[] = [];
  for (const t of g.triples) {
    const s = termToNQ(t.s);
    const p = `<${t.p}>`;
    const o = termToNQ(t.o);
    const gq = t.g ? ' ' + termToNQ(t.g) : '';
    lines.push(`${s} ${p} ${o}${gq} .`);
  }
  lines.sort();
  return lines;
}

function termToNQ(t: Term): string {
  if (t.kind === 'iri') {return t.value ? `<${t.value}>` : '';}
  if (t.kind === 'bnode') {return `_:${t.value}`;}

  const lit = JSON.stringify(t.value); 
  if (t.lang) {return `${lit}@${t.lang.toLowerCase()}`;}
  if (t.datatype) {return `${lit}^^<${t.datatype}>`;}
  return lit;
}
