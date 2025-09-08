/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Q } from './helpers';
import { SortFormatter } from '../../../business/triple-management/sorting/sort-formatter';

const parsed = {
  quads: [
    Q.quad(Q.namedNode('http://ex/b'), Q.namedNode('http://ex/p'), Q.namedNode('http://ex/o')),
    Q.quad(Q.namedNode('http://ex/a'), Q.namedNode('http://ex/p'), Q.namedNode('http://ex/o')),
  ],
  prefixes: { ex: 'http://ex/' },
  tokens: []
} as any;

describe('SortFormatter (unit)', () => {
  it('sorts by subject', async () => {
    const f = new SortFormatter();
    const text = await f.sortAndGroup(parsed, 'subject', 'asc');
    const aIdx = text.indexOf(':a ');
    const bIdx = text.indexOf(':b ');
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});  
