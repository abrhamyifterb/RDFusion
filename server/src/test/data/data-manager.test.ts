/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

import type { Connection } from 'vscode-languageserver/node';
import { Cache } from '../../data/cache/lru-cache';
import { DataManager } from '../../data/data-manager';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), } as any
  } as any as Connection;
}

describe('data/DataManager', () => {
  it('detects file formats', () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    expect(dm.findFileFormat('a.ttl')).toBe('turtle');
    expect(dm.findFileFormat('a.jsonld')).toBe('jsonld');
    expect(dm.findFileFormat('a.txt')).toBe('unknown');
  });

  it('parses and caches documents by version', async () => {
    const dm = new DataManager(new Cache(10), mockConnection());
    const uri = 'file:///mem.ttl';
    const text = '@prefix ex:<http://ex/> . ex:a ex:p ex:b .';
    const out1 = await dm.parseDocument(uri, text, 1);
    const out2 = await dm.parseDocument(uri, text, 1);
    expect(out1).toBe(out2); 
    const out3 = await dm.parseDocument(uri, text, 2);
    expect(out3).not.toBe(out2);
  });

  it('returns diagnostics and logs on parse error (no throw)', async () => {
    const conn = mockConnection();
    const dm = new DataManager(new Cache(10), conn);
    const bad = '@prefix ex:<http://ex/>\nex:a ex:p'; // missing object + terminator
    const out = await dm.parseDocument('file:///bad.ttl', bad, 1) as any;
    // Contract: resolves with diagnostics instead of throwing
    expect(Array.isArray(out.errors)).toBe(true);
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.quads.length).toBe(0);
    expect(out.tokens.length).toBe(0);
  });
});




