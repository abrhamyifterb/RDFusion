/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { DataManager } from '../../../data/data-manager';
import { Cache } from '../../../data/cache/lru-cache';
import { SortFormatter } from '../../../business/triple-management/sorting/sort-formatter';

const FIX = (name: string) => readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf8');

function mockConnection(): any {
  return { console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } };
}

describe('SortFormatter (integration DM)', () => {
  it('sorts by subject asc via DataManager parsed graph', async () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    const uri = 'file:///sample.ttl';
    const parsed = await dm.parseDocument(uri, FIX('sample.ttl'), 1);
    const text = await new SortFormatter().sortAndGroup(parsed as any, 'subject', 'asc');
    const aIdx = text.indexOf(':a ');
    const bIdx = text.indexOf(':b ');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx); 
  });
});
