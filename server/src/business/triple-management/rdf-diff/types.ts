export type Term =
  | { kind: 'iri'; value: string }
  | { kind: 'literal'; value: string; lang?: string; datatype?: string }
  | { kind: 'bnode'; value: string }; 

export interface Triple {
  s: Term;
  p: string; 
  o: Term;
  g: Term | null;  
}

export interface GraphData {
  triples: Triple[];
  bnodes: Set<string>;
}

export function sha1Of(s: string): string {
  let h = 0, i, chr;
  for (i = 0; i < s.length; i++) {
    chr = s.charCodeAt(i);
    h = ((h << 5) - h) + chr;
    h |= 0;
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}
