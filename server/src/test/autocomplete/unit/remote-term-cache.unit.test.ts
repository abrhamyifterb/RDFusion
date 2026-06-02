/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dereference: vi.fn(),
}));

vi.mock('rdf-dereference', () => ({
  rdfDereferencer: {
    dereference: mocks.dereference,
  },
}));

import { NEGATIVE_CACHE_TTL_MS, REMOTE_CACHE_TTL_MS, REMOTE_FETCH_NOTIFICATION_THROTTLE_MS, RemoteTermCache } from '../../../business/autocomplete/term-completion/remote-term-cache';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const RDFS_COMMENT = 'http://www.w3.org/2000/01/rdf-schema#comment';
const RDFS_DOMAIN = 'http://www.w3.org/2000/01/rdf-schema#domain';
const RDFS_RANGE = 'http://www.w3.org/2000/01/rdf-schema#range';
const OWL_OBJECT_PROPERTY = 'http://www.w3.org/2002/07/owl#ObjectProperty';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

function named(value: string): any {
  return { termType: 'NamedNode', value };
}

function literal(value: string): any {
  return { termType: 'Literal', value };
}

function q(s: string, p: string, o: any): any {
  return { subject: named(s), predicate: named(p), object: typeof o === 'string' ? named(o) : o };
}

function stream(quads: any[]): Readable {
  return Readable.from(quads, { objectMode: true });
}

function prefixRegistry(): any {
  const prefixes: Record<string, string> = {
    ex: 'http://example.com/vocab#',
    owl: 'http://www.w3.org/2002/07/owl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
  };
  return {
    ensure: vi.fn(async (prefix: string) => prefixes[prefix]),
    getIri: vi.fn((prefix: string) => prefixes[prefix]),
    getPrefix: vi.fn((iri: string) => Object.entries(prefixes).find(([, base]) => iri.startsWith(base))?.[0]),
    isKnownVocabulary: vi.fn((prefix: string, namespaceIri?: string) => {
      if (namespaceIri) return /^https?:\/\//i.test(namespaceIri);
      return !!prefixes[prefix];
    }),
    isKnownVocabularyNamespace: vi.fn((namespaceIri?: string) => !!namespaceIri && /^https?:\/\//i.test(namespaceIri)),
  };
}

describe('RemoteTermCache', () => {
  beforeEach(() => {
    mocks.dereference.mockReset();
  });

  it('falls back to exact-term dereferencing when the prefix vocabulary does not expose the term', async () => {
    const base = 'http://example.com/vocab#';
    const orphan = `${base}orphan`;
    mocks.dereference.mockImplementation(async (iri: string) => {
      if (iri === base) {
        return { data: stream([
          q(`${base}known`, RDFS_LABEL, literal('Known term')),
          q(`${base}known`, RDF_TYPE, OWL_CLASS),
        ]) };
      }
      if (iri === orphan) {
        return { data: stream([
          q(orphan, RDF_TYPE, OWL_OBJECT_PROPERTY),
          q(orphan, RDFS_COMMENT, literal('Only available from the term document.')),
          q(orphan, RDFS_DOMAIN, `${base}Person`),
          q(orphan, RDFS_RANGE, XSD_STRING),
        ]) };
      }
      return { data: stream([]) };
    });

    const cache = new RemoteTermCache(prefixRegistry());
    const info = await cache.ensureInfo('ex', 'orphan');

    expect(info?.term).toBe('orphan');
    expect(info?.vocabulary.iri).toBe(orphan);
    expect(info?.vocabulary.roles).toContain('property');
    expect(info?.vocabulary.types).toContain('owl:ObjectProperty');
    expect(info?.vocabulary.comments).toContain('Only available from the term document.');
    expect(info?.vocabulary.domains).toContain('ex:Person');
    expect(info?.vocabulary.ranges).toContain('xsd:string');
    expect(mocks.dereference).toHaveBeenCalledWith(base);
    expect(mocks.dereference).toHaveBeenCalledWith(orphan);
  });

  it('merges prefix-level and exact-term metadata for the same remote term', async () => {
    const base = 'http://example.com/vocab#';
    const knows = `${base}knows`;
    mocks.dereference.mockImplementation(async (iri: string) => {
      if (iri === base) {
        return { data: stream([
          q(knows, RDFS_LABEL, literal('knows')),
          q(knows, RDFS_DOMAIN, `${base}Person`),
        ]) };
      }
      if (iri === knows) {
        return { data: stream([
          q(knows, RDF_TYPE, OWL_OBJECT_PROPERTY),
          q(knows, RDFS_COMMENT, literal('Relates two people.')),
          q(knows, RDFS_RANGE, `${base}Person`),
        ]) };
      }
      return { data: stream([]) };
    });

    const cache = new RemoteTermCache(prefixRegistry());
    const info = await cache.ensureInfo('ex', 'knows');

    expect(info?.vocabulary.labels).toContain('knows');
    expect(info?.vocabulary.comments).toContain('Relates two people.');
    expect(info?.vocabulary.domains).toContain('ex:Person');
    expect(info?.vocabulary.ranges).toContain('ex:Person');
    expect(info?.vocabulary.roles).toContain('property');
  });

  it('uses one namespace-keyed cache entry for aliases pointing at the same vocabulary', async () => {
    const base = 'http://example.com/vocab#';
    mocks.dereference.mockImplementation(async (iri: string) => {
      expect(iri).toBe(base);
      return { data: stream([
        q(`${base}Person`, RDF_TYPE, OWL_CLASS),
      ]) };
    });

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await Promise.all([
      cache.prefetchPrefix('ex', connection, base),
      cache.prefetchPrefix('other', connection, base),
    ]);

    expect(mocks.dereference).toHaveBeenCalledTimes(1);
    expect(cache.getCachedTermsForPrefix('ex', base)).toContain('Person');
    expect(cache.getCachedTermsForPrefix('other', base)).toContain('Person');
  });

  it('does not fabricate terms before a remote vocabulary has been cached', () => {
    const cache = new RemoteTermCache(prefixRegistry());

    expect(cache.getCachedTermsForPrefix('thes', 'http://www.w3.org/2004/02/skos/core#')).toBeUndefined();
  });

  it('reuses the same cached vocabulary for completion and validation lookups', async () => {
    const base = 'http://example.com/vocab#';
    mocks.dereference.mockImplementation(async (iri: string) => {
      expect(iri).toBe(base);
      return { data: stream([
        q(`${base}Concept`, RDF_TYPE, OWL_CLASS),
        q(`${base}prefLabel`, RDF_TYPE, OWL_OBJECT_PROPERTY),
      ]) };
    });

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    const completionTerms = await cache.get('thes', connection, base);
    const validationTerms = cache.getCachedTermsForPrefix('skos', base);

    expect(completionTerms).toContain('Concept');
    expect(validationTerms).toContain('prefLabel');
    expect(mocks.dereference).toHaveBeenCalledTimes(1);
  });


  it('keeps successful remote vocabulary snapshots fresh for 24 hours', async () => {
    const base = 'http://example.com/vocab#';
    mocks.dereference.mockResolvedValue({
      data: stream([
        q(`${base}Concept`, RDF_TYPE, OWL_CLASS),
      ]),
    });

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await cache.get('ex:', connection, base);

    const remainingTtl = (cache as any).vocabularyCache.getRemainingTTL(base);
    expect(REMOTE_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(remainingTtl).toBeGreaterThan(REMOTE_CACHE_TTL_MS - 1000);
  });

  it('keeps empty remote vocabulary snapshots on the shorter negative cache TTL', async () => {
    const base = 'http://example.com/empty#';
    mocks.dereference.mockResolvedValue({ data: stream([]) });

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await cache.get('empty:', connection, base, { silent: true });

    const remainingTtl = (cache as any).vocabularyCache.getRemainingTTL(base);
    expect(NEGATIVE_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    expect(remainingTtl).toBeGreaterThan(NEGATIVE_CACHE_TTL_MS - 1000);
    expect(remainingTtl).toBeLessThanOrEqual(NEGATIVE_CACHE_TTL_MS);
  });

  it('can dereference document-declared remote vocabulary namespaces that are not in the registry', async () => {
    const remoteBase = 'https://vocab.example.org/terms#';
    mocks.dereference.mockImplementation(async (iri: string) => {
      expect(iri).toBe(remoteBase);
      return { data: stream([
        q(`${remoteBase}Thing`, RDF_TYPE, OWL_CLASS),
      ]) };
    });
    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    const terms = await cache.get('local:', connection, remoteBase);
    await cache.prefetchPrefix('local', connection, remoteBase);
    const info = await cache.ensureInfo('local', 'Thing', remoteBase);

    expect(terms).toContain('Thing');
    expect(info?.term).toBe('Thing');
    expect(cache.getCachedTermsForPrefix('local', remoteBase)).toContain('Thing');
    expect(mocks.dereference).toHaveBeenCalledTimes(1);
  });


  it('throttles repeated completion failure notifications for a negative-cached vocabulary', async () => {
    const base = 'http://example.com/unavailable#';
    mocks.dereference.mockRejectedValue(new Error('network unavailable'));

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await cache.get('missing:', connection, base);
    await cache.get('missing:', connection, base);
    await cache.get('alias:', connection, base);

    expect(connection.window.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(connection.window.showErrorMessage).toHaveBeenCalledWith(
      'Unable to fetch remote vocabulary terms for prefix "missing". The vocabulary may be unavailable or your network connection failed.',
    );
    expect(mocks.dereference).toHaveBeenCalledTimes(1);
  });

  it('does not spend the notification throttle during silent prefetch failures', async () => {
    const base = 'http://example.com/prefetch-failure#';
    mocks.dereference.mockRejectedValue(new Error('network unavailable'));

    const cache = new RemoteTermCache(prefixRegistry());
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await cache.prefetchPrefix('silent', connection, base);
    await cache.get('silent:', connection, base);
    await cache.get('silent:', connection, base);

    expect(connection.window.showErrorMessage).toHaveBeenCalledTimes(1);
    expect(mocks.dereference).toHaveBeenCalledTimes(1);
  });

  it('allows a new completion failure notification after the throttle expires', async () => {
    vi.useFakeTimers();
    try {
      const base = 'http://example.com/flaky#';
      mocks.dereference.mockRejectedValue(new Error('network unavailable'));

      const cache = new RemoteTermCache(prefixRegistry());
      const connection = { window: { showErrorMessage: vi.fn() } } as any;

      await cache.get('flaky:', connection, base);
      await vi.advanceTimersByTimeAsync(REMOTE_FETCH_NOTIFICATION_THROTTLE_MS + 1);
      await cache.get('flaky:', connection, base);

      expect(connection.window.showErrorMessage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

});
