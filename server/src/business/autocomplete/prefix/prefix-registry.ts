import { Cache } from './cache.js';
import { IFetcher } from './ifetcher';
import { DC_NS, DCAT_NS, DCTERMS_NS, FOAF_NS, OWL_NS, PROV_NS, RDF_NS, RDFS_NS, SCHEMA_NS, SKOS_NS, XSD_NS } from '../../../data/rdf/rdf-vocabulary';

export const PREFIX_CC_FETCH_TIMEOUT_MS = 5000;
export const PREFIX_CC_POPULAR_ALL_URL = 'https://prefix.cc/popular/all.json';
export const PREFIX_CC_AGGREGATE_URLS = [
  PREFIX_CC_POPULAR_ALL_URL,
  'http://prefix.cc/popular/all.json',
  'https://prefix.cc/context.jsonld',
];

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
  private preloadRemotePromise: Promise<void>;
  private remoteAggregateLoaded = false;

  constructor(private fetcher: IFetcher) {
    for (const [p, iri] of Object.entries(DEFAULT_PREFIXES)) {
      this.setPinned(p, iri);
    }
    this.preloadRemotePromise = this.preloadRemote();
  }

  private async preloadRemote() {
    await this.loadRemoteAggregate();
  }

  private async loadRemoteAggregate(): Promise<void> {
    let loadedAny = false;

    for (const url of PREFIX_CC_AGGREGATE_URLS) {
      try {
        const data = await this.fetcher.getPrefixes<unknown>(
          url,
          { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
        );
        const entries = this.extractPrefixEntries(data);
        if (entries.length > 0) {
          for (const [p, iri] of entries) {this.setDynamic(p, iri);}
          loadedAny = true;
          break;
        }
      } catch {
        /*  */
      }
    }

    this.remoteAggregateLoaded = this.remoteAggregateLoaded || loadedAny;
  }

  private extractPrefixEntries(data: unknown): [string, string][] {
    if (!data || typeof data !== 'object') {return [];}

    const entries: [string, string][] = [];
    const objects: Record<string, unknown>[] = [data as Record<string, unknown>];
    const context = (data as Record<string, unknown>)['@context'];
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      objects.unshift(context as Record<string, unknown>);
    }

    for (const object of objects) {
      for (const [rawPrefix, rawValue] of Object.entries(object)) {
        const prefix = rawPrefix.trim();
        if (!prefix || prefix.startsWith('@')) {continue;}

        let iri: string | undefined;
        if (typeof rawValue === 'string') {
          iri = rawValue;
        } else if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
          const id = (rawValue as Record<string, unknown>)['@id'];
          if (typeof id === 'string') {iri = id;}
        }

        const cleanIri = iri?.trim();
        if (cleanIri) {entries.push([prefix, cleanIri]);}
      }
    }

    return entries;
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
    const cleanPrefix = prefix.trim();
    return this.dynPrefixToIri.get(cleanPrefix)
      ?? this.pinnedPrefixToIri.get(cleanPrefix)
      ?? this.dynPrefixToIri.get(cleanPrefix.toLowerCase())
      ?? this.pinnedPrefixToIri.get(cleanPrefix.toLowerCase());
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
    const cleanPrefix = prefix.trim();
    if (!cleanPrefix) {return undefined;}

    let hit = this.getIri(cleanPrefix);
    if (hit !== undefined) {return hit;}

    await this.preloadRemotePromise;
    hit = this.getIri(cleanPrefix);
    if (hit !== undefined) {return hit;}

    // The single-prefix prefix.cc endpoint can be unavailable for some
    // prefixes that are present in the aggregate cache, for example adms. If
    // startup preload failed or timed out, retry the aggregate cache on demand
    // before reporting the prefix as unknown.
    if (!this.remoteAggregateLoaded) {
      await this.loadRemoteAggregate();
      hit = this.getIri(cleanPrefix);
      if (hit !== undefined) {return hit;}
    }

    const lookupPrefixes = Array.from(new Set([cleanPrefix, cleanPrefix.toLowerCase()]));
    for (const lookupPrefix of lookupPrefixes) {
      for (const scheme of ['https', 'http']) {
        try {
          const data = await this.fetcher.getPrefixes<unknown>(
            `${scheme}://prefix.cc/${encodeURIComponent(lookupPrefix)}.file.json`,
            { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
          );
          const entries = this.extractPrefixEntries(data);
          const match = entries.find(([p]) =>
            p === cleanPrefix || p.toLowerCase() === cleanPrefix.toLowerCase(),
          );
          if (match) {
            const [canonicalPrefix, iri] = match;
            this.setDynamic(canonicalPrefix, iri);
            if (canonicalPrefix !== cleanPrefix) {this.setDynamic(cleanPrefix, iri);}
            return iri;
          }
        } catch { /* Try the next prefix.cc lookup URL. */ }
      }
    }
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
    const schemeVariants = new Set<string>([t]);
    if (t.startsWith('http://'))  {schemeVariants.add('https://' + t.slice(7));}
    if (t.startsWith('https://')) {schemeVariants.add('http://'  + t.slice(8));}

    const out = new Set<string>();
    for (const variant of schemeVariants) {
      const last = variant.charAt(variant.length - 1);
      const hasSlash = last === '/';
      const hasHash = last === '#';
      const base = (hasSlash || hasHash) ? variant.slice(0, -1) : variant;

      out.add(variant);
      if (hasSlash) {out.add(`${base}#`);}
      else if (hasHash) {out.add(`${base}/`);}
      else { out.add(`${variant}/`); out.add(`${variant}#`); }
    }

    return Array.from(out);
  }
}
