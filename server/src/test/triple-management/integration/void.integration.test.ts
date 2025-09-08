/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { DataManager } from '../../../data/data-manager';
import { Cache } from '../../../data/cache/lru-cache';
import { VoIDGenerateCommand } from '../../../business/triple-management/void-generate/void-generate-command';

const FIX = (name: string) => readFileSync(join(__dirname, '..', '..', 'fixtures', name), 'utf8');

function mockConnection(): any {
  return { console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } };
}

describe('VoIDGenerateCommand (integration with DM)', () => {
  it('generate VoID for parsed ttl', async () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    const uri = 'file:///sample.ttl';
    await dm.parseDocument(uri, FIX('sample.ttl'), 1);
    const cmd = new VoIDGenerateCommand(dm, mockConnection());
    const ttl = await cmd.execute({ uri });
    expect(ttl).toMatch(/void:triples/);
    expect(ttl).toMatch(/void:properties/);
  }); 
});
