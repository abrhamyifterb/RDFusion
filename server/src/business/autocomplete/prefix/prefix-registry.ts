import { Cache } from './cache.js';
import { IFetcher } from './ifetcher';
import { DC_NS, DCAT_NS, DCTERMS_NS, FOAF_NS, OWL_NS, PROV_NS, RDF_NS, RDFS_NS, SCHEMA_NS, SKOS_NS, XSD_NS } from '../../../data/rdf/rdf-vocabulary';

export const PREFIX_CC_FETCH_TIMEOUT_MS = 5000;

export const DEFAULT_PREFIXES: Record<string, string> = {
  rdf:     RDF_NS,
  rdfs:    RDFS_NS,
  owl:     OWL_NS,
  xsd:     XSD_NS,
  skos:    SKOS_NS,
  foaf:    FOAF_NS,
  schema:  SCHEMA_NS,
  dcterms: DCTERMS_NS,
  dct:     DCTERMS_NS,
  dc:      DC_NS,
  dcat:    DCAT_NS,
  prov:    PROV_NS,
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
        'https://prefix.cc/popular/all.file.json',
        { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
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

    for (const { prefix, iri: known } of this.dynPrefixToIri.getAll()) {
      if (this.iriStartsWithKnownNamespace(iri, known)) {return prefix;}
    }
    for (const [prefix, known] of this.pinnedPrefixToIri.entries()) {
      if (this.iriStartsWithKnownNamespace(iri, known)) {return prefix;}
    }
    return undefined;
  }

  /**
   * A namespace explicitly declared in a Turtle prefix or JSON-LD context can be
   * treated as a remote vocabulary candidate even when it is not in the built-in
   * prefix list or prefix.cc. RDFusion only uses it for diagnostics after a
   * vocabulary document has actually been fetched and parsed successfully.
   */
  public isKnownVocabularyNamespace(iri: string | undefined): boolean {
    if (!iri) return false;
    return this.isPotentialRemoteVocabularyNamespace(iri) || this.hasExactKnownNamespace(iri);
  }

  /**
   * When a namespace IRI is supplied by the current document, validate/fetch by
   * that IRI rather than by the prefix label. This allows aliases and remote
   * vocabularies outside the default prefix list to share the same cache.
   */
  public isKnownVocabulary(prefix: string, namespaceIri?: string): boolean {
    if (namespaceIri !== undefined) {
      return this.isKnownVocabularyNamespace(namespaceIri);
    }
    return this.getIri(prefix) !== undefined;
  }

  public async ensure(prefix: string): Promise<string | undefined> {
    const hit = this.getIri(prefix);
    if (hit !== undefined) {return hit;}

    try {
      const data = await this.fetcher.getPrefixes<Record<string, string>>(
        `https://prefix.cc/${encodeURIComponent(prefix)}.file.json`,
        { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
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



  private isPotentialRemoteVocabularyNamespace(iri: string): boolean {
    const t = iri.trim();
    if (/\s/.test(t)) return false;
    return /^https?:\/\/[^\s<>]+$/i.test(t);
  }

  private hasExactKnownNamespace(iri: string): boolean {
    const variants = new Set(this.iriVariants(iri));
    for (const { iri: known } of this.dynPrefixToIri.getAll()) {
      if (variants.has(known)) return true;
    }
    for (const known of this.pinnedPrefixToIri.values()) {
      if (variants.has(known)) return true;
    }
    return false;
  }

  private iriStartsWithKnownNamespace(iri: string, knownNamespace: string): boolean {
    if (iri.startsWith(knownNamespace)) return true;
    return this.iriVariants(knownNamespace).some(variant => iri.startsWith(variant));
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
