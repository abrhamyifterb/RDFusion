/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { IFetcher } from '../../../business/autocomplete/prefix/ifetcher';
import { PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';

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
  it('preloads and ensures single prefix on demand', async () => {
    const fetcher = makeFetcher({ dc: 'http://purl.org/dc/terms/' });
    const reg = new PrefixRegistry(fetcher as any);

    await new Promise(r => setTimeout(r, 0));
    const all = reg.getAll();
    expect(all.some(e => e.prefix==='ex' && e.iri==='http://ex/')).toBe(true);

    const skos = await reg.ensure('skos' as any);
    expect(skos).toBe('http://www.w3.org/2004/02/skos/core#');
  });
});
