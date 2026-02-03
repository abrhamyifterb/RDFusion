import { canonicalizeDetailedFromTTL } from './c14n';

export interface SemanticDiffResult {
  leftAligned: string;
  rightAligned: string;
  adds: string[];
  dels: string[];
  isIsomorphic: boolean;
  method: 'CANON';
}

function diffSets(leftLines: string[], rightLines: string[]) {
  const L = new Set(leftLines), R = new Set(rightLines);
  const adds: string[] = [], dels: string[] = [];
  for (const l of L) {if (!R.has(l)) dels.push(l);}
  for (const r of R) {if (!L.has(r)) adds.push(r);}
  adds.sort(); dels.sort();
  return { adds, dels };
}

function buildDisplayIdRemap(
  leftCanon: string,
  rightCanon: string,
  leftIssued: ReadonlyMap<string,string>,
  rightIssued: ReadonlyMap<string,string>
): Map<string,string> {

  const leftCanonIds = new Set<string>(leftIssued ? Array.from(leftIssued.values()) : []);
  const rightCanonIds = new Set<string>(rightIssued ? Array.from(rightIssued.values()) : []);

  const orderFrom = (canon: string, allow: Set<string>) => {
    const re = /_:(c14n\d+)\b/g;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of canon.matchAll(re)) {
      const id = m[1]!;
      if (allow.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  };

  const leftOrder  = orderFrom(leftCanon, leftCanonIds);
  const rightOrder = orderFrom(rightCanon, rightCanonIds);

  const map = new Map<string,string>();
  const n = Math.min(leftOrder.length, rightOrder.length);
  for (let i=0;i<n;i++) {map.set(rightOrder[i]!, leftOrder[i]!);}
  return map;
}

function applyRemapToCanonical(canon: string, remap: Map<string,string>): string {
  if (remap.size === 0) {return canon;}

  const pattern = new RegExp(
    `_:(${Array.from(remap.keys()).map(k=>k.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')).join('|')})\\b`,
    'g'
  );
  return canon.replace(pattern, (_m, id: string) => `_:${remap.get(id) ?? id}`);
}

export async function semanticAlignAndDiff(
  leftTTL: string,
  rightTTL: string,
  baseIRI: string
): Promise<SemanticDiffResult> {

  const [L, R] = await Promise.all([
    canonicalizeDetailedFromTTL(leftTTL ?? '', baseIRI),
    canonicalizeDetailedFromTTL(rightTTL ?? '', baseIRI),
  ]);

  const isIso = L.hash === R.hash; 
  const leftOut  = L.canonical_form;
  let rightOut = R.canonical_form;

  if (isIso && leftOut !== rightOut) {
    const remap = buildDisplayIdRemap(
      L.canonical_form,
      R.canonical_form,
      L.issued_identifier_map,
      R.issued_identifier_map
    );
    rightOut = applyRemapToCanonical(R.canonical_form, remap);
  }

  const leftLines  = leftOut.split(/\r?\n/).filter(Boolean);
  const rightLines = rightOut.split(/\r?\n/).filter(Boolean);
  const { adds, dels } = diffSets(leftLines, rightLines);

  return {
    leftAligned: leftOut,
    rightAligned: rightOut,
    adds, dels,
    isIsomorphic: isIso && adds.length === 0 && dels.length === 0,
    method: 'CANON'
  };
}
