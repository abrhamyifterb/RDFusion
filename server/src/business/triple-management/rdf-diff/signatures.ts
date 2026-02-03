import { GraphData } from './types';

export function buildSignatures(g: GraphData) {
  const sig = new Map<string, string>();

  const incOut = new Map<string, Map<string, number>>();
  const incIn  = new Map<string, Map<string, number>>();
  const degIn  = new Map<string, number>();
  const degOut = new Map<string, number>();
  const litOut = new Map<string, number>();
  const iriOut = new Map<string, number>();

  function bump(map: Map<string, number>, k: string, dv = 1) {
    map.set(k, (map.get(k) || 0) + dv);
  }
  function bumpMap(map: Map<string, Map<string, number>>, id: string, k: string) {
    let m = map.get(id);
    if (!m) { m = new Map(); map.set(id, m); }
    bump(m, k);
  }

  for (const t of g.triples) {
    if (t.s.kind === 'bnode') {
      bump(degOut, t.s.value);
      bumpMap(incOut, t.s.value, t.p);
      if (t.o.kind === 'literal') {bump(litOut, t.s.value);}
      if (t.o.kind === 'iri')     {bump(iriOut, t.s.value);}
    }
    if (t.o.kind === 'bnode') {
      bump(degIn, t.o.value);
      bumpMap(incIn, t.o.value, t.p);
    }
    if (t.g && t.g.kind === 'bnode') {
      bump(degOut, t.g.value);
      bumpMap(incOut, t.g.value, '@graph');
    }
  }

  for (const id of g.bnodes) {
    const outDeg = degOut.get(id) || 0;
    const inDeg  = degIn.get(id)  || 0;
    const outPreds = mapToKey(incOut.get(id));
    const inPreds  = mapToKey(incIn.get(id));
    const lit = litOut.get(id) || 0;
    const iri = iriOut.get(id) || 0;
    const s = `in:${inDeg}|out:${outDeg}|inP:${inPreds}|outP:${outPreds}|lit:${lit}|iri:${iri}`;
    sig.set(id, s);
  }

  return sig;
}

function mapToKey(m?: Map<string, number>): string {
  if (!m) {return '';}
  const arr = Array.from(m.entries()).sort((a,b) => a[0].localeCompare(b[0]));
  return arr.map(([k,v]) => `${k}:${v}`).join(',');
}

export function buildCandidateMap(left: GraphData, right: GraphData) {
  const sigL = buildSignatures(left);
  const sigR = buildSignatures(right);

  const reverse = new Map<string, string[]>();
  for (const r of right.bnodes) {
    const s = sigR.get(r) || '';
    const list = reverse.get(s) || [];
    list.push(r);
    reverse.set(s, list);
  }

  const candidates = new Map<string, string[]>();
  const order: string[] = [];
  for (const l of left.bnodes) {
    const s = sigL.get(l) || '';
    const cands = (reverse.get(s) || []).slice();
    candidates.set(l, cands);
    order.push(l);
  }

  order.sort((a,b) => (candidates.get(a)!.length - candidates.get(b)!.length) || a.localeCompare(b));
  return { order, candidates };
}
