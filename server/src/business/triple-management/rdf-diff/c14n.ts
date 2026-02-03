import { Parser as N3Parser, Writer as N3Writer, DataFactory } from 'n3';
import { RDFC10 } from 'rdfjs-c14n';

if (!globalThis.crypto?.subtle) {
  throw new Error('WebCrypto not available. Node 21+ recommended for rdfjs-c14n.');
}

export async function ttlToNQuads(ttl: string, baseIRI: string): Promise<string> {
  const parser = new N3Parser({ baseIRI, format: 'text/turtle' });
  const quads = parser.parse(ttl ?? '');
  const writer = new N3Writer({ format: 'N-Quads' });
  writer.addQuads(quads);
  return new Promise<string>((res, rej) =>
    writer.end((err, out) => (err ? rej(err) : res(out || '')))
  );
}

export interface CanonDetail {
  canonical_form: string; 
  issued_identifier_map: ReadonlyMap<string, string>; 
  hash: string;
}

export async function canonicalizeDetailedFromNQ(nq: string): Promise<CanonDetail> {
  const rdfc10 = new RDFC10(DataFactory);

  const det = await rdfc10.c14n(nq);

  const canon = det.canonical_form.replace(/\r\n?/g, '\n');
  const hash  = await rdfc10.hash(det.canonicalized_dataset);
  return {
    canonical_form: canon,
    issued_identifier_map: det.issued_identifier_map,
    hash
  };
}

export async function canonicalizeDetailedFromTTL(ttl: string, baseIRI: string): Promise<CanonDetail> {
  const nq = await ttlToNQuads(ttl, baseIRI);
  return canonicalizeDetailedFromNQ(nq);
}
