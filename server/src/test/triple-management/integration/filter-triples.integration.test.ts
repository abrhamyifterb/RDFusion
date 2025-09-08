/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { DataManager } from '../../../data/data-manager';
import { Cache } from '../../../data/cache/lru-cache';
import { FilterTriplesCommand } from '../../../business/triple-management/filtering/filter-triples-command';

const FIX = (name: string) => readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf8');

function mockConnection(): any {
  return { console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } };
}

describe('FilterTriplesCommand (integration with Data Module)', () => {
  it('filters TTL', async () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    const uri = 'file:///sample.ttl';
    await dm.parseDocument(uri, FIX('sample.ttl'), 1);
    const cmd = new FilterTriplesCommand(dm, mockConnection());
    const out = await cmd.execute({
      uri,
      subjectFilters: ['ex:a'],
      predicateFilters: ['ex:p'],
      objectFilters: ['ex:o1']
    } as any);
    expect(typeof out).toBe('string');
    expect(out).toMatch(/ex:a/);
    expect(out).toMatch(/ex:p/);
    expect(out).not.toMatch(/ex:b/);
  });

  it('filters JSON-LD', async () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    const uri = 'file:///sample.jsonld';
    await dm.parseDocument(uri, FIX('sample.jsonld'), 1);
    const cmd = new FilterTriplesCommand(dm, mockConnection());
    const out = await cmd.execute({
      uri,
      subjectFilters: ['<http://ex/a>'],
      predicateFilters: ['ex:p'],
      objectFilters: ['<http://ex/o1>']
    } as any);
    const json = JSON.parse(out);
    const arr = Array.isArray(json) ? json : [json];
    const ids = arr.map((n:any)=>n['@id']).filter(Boolean);
    expect(ids.includes('http://ex/a')).toBe(true);
  });  
});
