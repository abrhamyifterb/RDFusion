import { GraphData, Term, Triple } from './types';
import { buildCandidateMap } from './signatures';

function rewriteTermPartial(t: Term, leftToRight: Map<string,string>, side: 'LEFT'|'RIGHT'): string {
  if (t.kind !== 'bnode') {
    if (t.kind === 'iri') {return `<${t.value}>`;}
    // eslint-disable-next-line prefer-const
    let lit = JSON.stringify(t.value);
    if (t.lang) {return `${lit}@${t.lang.toLowerCase()}`;}
    if (t.datatype) {return `${lit}^^<${t.datatype}>`;}
    return lit;
  }
  const raw = t.value;
  if (side === 'LEFT') {
    const mapped = leftToRight.get(raw);
    return mapped ? `_:${mapped}` : `?L:${raw}`;
  } else {
    let inv: string | undefined;
    for (const [l,r] of leftToRight) {if (r === raw) { inv = l; break; }}
    return inv ? `_:${inv}` : `?R:${raw}`;
  }
}

function rewriteTriplePartial(tr: Triple, map: Map<string,string>, side: 'LEFT'|'RIGHT'): string[] {
  const s = rewriteTermPartial(tr.s, map, side);
  const p = `<${tr.p}>`;
  const o = rewriteTermPartial(tr.o, map, side);
  const g = tr.g ? ' ' + rewriteTermPartial(tr.g, map, side) : '';
  return (s + ' ' + p + ' ' + o + g).split(' ');
}

function tokensCompatible(a: string, b: string): boolean {
  if (a === b) {return true;}
  if (a.startsWith('?L:') || a.startsWith('?R:')) {return true;}
  if (b.startsWith('?L:') || b.startsWith('?R:')) {return true;}
  return false;
}

function partialFeasible(left: GraphData, right: GraphData, map: Map<string,string>): boolean {
  const rightTokens = right.triples.map(tr => rewriteTriplePartial(tr, map, 'RIGHT'));
  for (const ltr of left.triples) {
    const L = rewriteTriplePartial(ltr, map, 'LEFT');
    let ok = false;
    for (const R of rightTokens) {
      if (L.length !== R.length) {continue;}
      let good = true;
      for (let i=0;i<L.length;i++) {if (!tokensCompatible(L[i]!, R[i]!)) { good = false; break; }}
      if (good) { ok = true; break; }
    }
    if (!ok) {return false;}
  }

  const leftTokens = left.triples.map(tr => rewriteTriplePartial(tr, map, 'LEFT'));
  for (const rtr of right.triples) {
    const R = rewriteTriplePartial(rtr, map, 'RIGHT');
    let ok = false;
    for (const L of leftTokens) {
      if (L.length !== R.length) {continue;}
      let good = true;
      for (let i=0;i<L.length;i++) {if (!tokensCompatible(L[i]!, R[i]!)) { good = false; break; }}
      if (good) { ok = true; break; }
    }
    if (!ok) {return false;}
  }
  return true;
}

function finalCheck(left: GraphData, right: GraphData, map: Map<string,string>): boolean {
  const inv = new Map<string,string>();
  for (const [l,r] of map) {inv.set(r,l);}

  function rwL(t: Term): string {
    if (t.kind === 'bnode') {
      const rid = map.get(t.value);
      return rid ? `_:${rid}` : '_:UNMAPPED';
    }
    if (t.kind === 'iri') {return `<${t.value}>`;}
    const lit = JSON.stringify(t.value);
    if (t.lang) {return `${lit}@${t.lang.toLowerCase()}`;}
    if (t.datatype) {return `${lit}^^<${t.datatype}>`;}
    return lit;
  }
  function rwR(t: Term): string {
    if (t.kind === 'bnode') {
      const l = inv.get(t.value);
      return l ? `_:${l}` : '_:UNMAPPED';
    }
    if (t.kind === 'iri') {return `<${t.value}>`;}
    const lit = JSON.stringify(t.value);
    if (t.lang) {return `${lit}@${t.lang.toLowerCase()}`;}
    if (t.datatype) {return `${lit}^^<${t.datatype}>`;}
    return lit;
  }

  const L = new Set(left.triples.map(tr => {
    const s = rwL(tr.s), p = `<${tr.p}>`, o = rwL(tr.o), g = tr.g ? ' ' + rwL(tr.g) : '';
    return `${s} ${p} ${o}${g} .`;
  }));
  const R = new Set(right.triples.map(tr => {
    const s = rwR(tr.s), p = `<${tr.p}>`, o = rwR(tr.o), g = tr.g ? ' ' + rwR(tr.g) : '';
    return `${s} ${p} ${o}${g} .`;
  }));

  if (L.size !== R.size) {return false;}
  for (const line of L) {if (!R.has(line)) return false;}
  return true;
}

export function computeIsomorphismMapping(left: GraphData, right: GraphData): Map<string,string> | null {
  if (left.bnodes.size !== right.bnodes.size) {return null;}

  const { order, candidates } = buildCandidateMap(left, right);
  for (const l of order) {if ((candidates.get(l) ?? []).length === 0) return null;}

  const map = new Map<string,string>();
  const usedR = new Set<string>();

  function backtrack(i: number): boolean {
    if (i === order.length) {return finalCheck(left, right, map);}
    const l = order[i]!;
    if (map.has(l)) {return backtrack(i+1);}

    const opts = candidates.get(l)!.slice();
    
    opts.sort();

    for (const r of opts) {
      if (usedR.has(r)) {continue;}

      map.set(l, r);
      usedR.add(r);

      if (partialFeasible(left, right, map) && backtrack(i+1)) {return true;}

      map.delete(l);
      usedR.delete(r);
    }
    return false;
  }

  return backtrack(0) ? map : null;
}

export function rewriteRightWithMapping(right: GraphData, leftToRight: Map<string,string>): GraphData {
  const inv = new Map<string,string>();
  for (const [l,r] of leftToRight) {inv.set(r,l);}

  function rw(t: Term): Term {
    if (t.kind !== 'bnode') {return t;}
    const raw = t.value;
    const mapped = inv.get(raw);
    return mapped ? { kind: 'bnode', value: mapped } : t;
  }

  return {
    bnodes: new Set<string>(Array.from(right.bnodes).map(id => inv.get(id) ?? id)),
    triples: right.triples.map(tr => ({
      s: rw(tr.s),
      p: tr.p,
      o: rw(tr.o),
      g: tr.g ? rw(tr.g) : null
    }))
  };
}
