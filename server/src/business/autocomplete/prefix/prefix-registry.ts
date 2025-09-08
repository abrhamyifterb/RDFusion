import { Cache } from './cache.js';
import { IFetcher } from './ifetcher';

export const DEFAULT_PREFIXES: Record<string, string> = {
  rdf:     'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs:    'http://www.w3.org/2000/01/rdf-schema#',
  owl:     'http://www.w3.org/2002/07/owl#',
  xsd:     'http://www.w3.org/2001/XMLSchema#',
  skos:    'http://www.w3.org/2004/02/skos/core#',
  foaf:    'http://xmlns.com/foaf/0.1/',
  schema:  'http://schema.org/',
  dcterms: 'http://purl.org/dc/terms/',
  dc:      'http://purl.org/dc/elements/1.1/',
  prov:    'http://www.w3.org/ns/prov#',
};

export class PrefixRegistry {
  private pinnedPrefixToIri = new Map<string, string>();
  private pinnedIriToPrefix = new Map<string, string>();

  private dynPrefixToIri = new Cache();
  private dynIriToPrefix = new Cache(); 

  constructor(private fetcher: IFetcher) {
    for (const [p, iri] of Object.entries(DEFAULT_PREFIXES)) {
      this.setPinned(p, iri);
    }
    void this.preloadRemote();
  }

  private async preloadRemote() {
    try {
      const data = await this.fetcher.getPrefixes<Record<string, string>>(
        'https://prefix.cc/popular/all.file.json'
      );
      if (data && typeof data === 'object') {
        for (const [p, iri] of Object.entries(data)) {this.setDynamic(p, iri);}
      }
    } catch {
      /*  */
    }
  }

  private setPinned(prefix: string, iri: string) {
    const t = iri.trim();
    this.pinnedPrefixToIri.set(prefix, t);
    for (const v of this.iriVariants(t)) {
      if (!this.pinnedIriToPrefix.has(v)) {this.pinnedIriToPrefix.set(v, prefix);}
    }
  }

  private setDynamic(prefix: string, iri: string) {
    const t = iri.trim();
    this.dynPrefixToIri.set(prefix, t);
    for (const v of this.iriVariants(t)) {
      if (!this.dynIriToPrefix.get(v)) {this.dynIriToPrefix.set(v, prefix);}
    }
  }

  public getIri(prefix: string): string | undefined {
    return this.dynPrefixToIri.get(prefix) ?? this.pinnedPrefixToIri.get(prefix);
  }

  public getPrefix(iri: string): string | undefined {
    for (const v of this.iriVariants(iri)) {
      const pDyn = this.dynIriToPrefix.get(v);
      if (pDyn) {return pDyn;}
      const pPinned = this.pinnedIriToPrefix.get(v);
      if (pPinned) {return pPinned;}
    }
    const variants = new Set(this.iriVariants(iri));
    for (const { prefix, iri: known } of this.dynPrefixToIri.getAll()) {
      if (variants.has(known)) {
        for (const v of variants) {this.dynIriToPrefix.set(v, prefix);}
        return prefix;
      }
    }
    for (const [prefix, known] of this.pinnedPrefixToIri.entries()) {
      if (variants.has(known)) {
        for (const v of variants) {this.dynIriToPrefix.set(v, prefix);}
        return prefix;
      }
    }
    return undefined;
  }

  public async ensure(prefix: string): Promise<string | undefined> {
    const hit = this.getIri(prefix);
    if (hit !== undefined) {return hit;}

    try {
      const data = await this.fetcher.getPrefixes<Record<string, string>>(
        `https://prefix.cc/${encodeURIComponent(prefix)}.file.json`
      );
      const iri = data?.[prefix];
      if (iri) {
        this.setDynamic(prefix, iri);
        return iri;
      }
    } catch { /*  */ }
    return undefined;
  }

  public getAll(): { prefix: string; iri: string }[] {
    const merged = new Map<string, string>(this.pinnedPrefixToIri);
    for (const { prefix, iri } of this.dynPrefixToIri.getAll()) {merged.set(prefix, iri);}
    return Array.from(merged, ([prefix, iri]) => ({ prefix, iri }));
  }


  private iriVariants(iri: string): string[] {
    const t = iri.trim();
    const last = t.charAt(t.length - 1);
    const hasSlash = last === '/';
    const hasHash = last === '#';
    const base = (hasSlash || hasHash) ? t.slice(0, -1) : t;

    const out = new Set<string>([t]);
    if (hasSlash) {out.add(`${base}#`);}
    else if (hasHash) {out.add(`${base}/`);}
    else { out.add(`${t}/`); out.add(`${t}#`); }

    if (t.startsWith('http://'))  {out.add('https://' + t.slice(7));}
    if (t.startsWith('https://')) {out.add('http://'  + t.slice(8));}
    return Array.from(out);
  }
}
