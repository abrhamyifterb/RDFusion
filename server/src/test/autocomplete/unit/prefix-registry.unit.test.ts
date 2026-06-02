/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { IFetcher } from '../../../business/autocomplete/prefix/ifetcher';
import { PREFIX_CC_FETCH_TIMEOUT_MS, PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';

const makeFetcher = (map: Record<string,string>) => ({
  getPrefixes: vi.fn(async (url: string) => {
    if (url.endsWith('popular/all.file.json')) {
      return { ex: 'http://ex/', foaf: 'http://xmlns.com/foaf/0.1/' };
    }
    const key = url.split('/').pop()!.replace('.file.json','');
    return { [key]: map[key] };
  })
}) as unknown as IFetcher;

describe('PrefixRegistry (unit)', () => {
  it('preloads and ensures single prefix on demand with prefix.cc timeouts', async () => {
    const fetcher = makeFetcher({ custom: 'http://custom.example/vocab#' });
    const reg = new PrefixRegistry(fetcher as any);

    await new Promise(r => setTimeout(r, 0));
    const all = reg.getAll();
    expect(all.some(e => e.prefix==='ex' && e.iri==='http://ex/')).toBe(true);
    expect(fetcher.getPrefixes).toHaveBeenCalledWith(
      'https://prefix.cc/popular/all.file.json',
      { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
    );

    const custom = await reg.ensure('custom' as any);
    expect(custom).toBe('http://custom.example/vocab#');
    expect(fetcher.getPrefixes).toHaveBeenCalledWith(
      'https://prefix.cc/custom.file.json',
      { timeoutMs: PREFIX_CC_FETCH_TIMEOUT_MS },
    );
  });

  it('treats document-declared HTTP namespaces as remote vocabulary candidates', async () => {
    const fetcher = makeFetcher({});
    const reg = new PrefixRegistry(fetcher as any);

    await new Promise(r => setTimeout(r, 0));

    expect(reg.isKnownVocabularyNamespace('http://www.w3.org/2004/02/skos/core#')).toBe(true);
    expect(reg.isKnownVocabulary('alias', 'http://www.w3.org/2004/02/skos/core#')).toBe(true);
    expect(reg.isKnownVocabularyNamespace('http://local.example/vocab#')).toBe(true);
    expect(reg.isKnownVocabulary('local', 'http://local.example/vocab#')).toBe(true);
    expect(reg.isKnownVocabulary('skos', 'http://local.example/vocab#')).toBe(true);
    expect(reg.isKnownVocabularyNamespace('urn:local:vocab')).toBe(false);
    expect(reg.getPrefix('http://www.w3.org/2004/02/skos/core#Concept')).toBe('skos');
  });

});
