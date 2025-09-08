/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import MillianRDFParser from '../../data/turtle/ttl-parser';


const FIX = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
const { iri } = await import('./helpers');

describe('data/turtle: MillianRDFParser', () => {
  it('parses valid Turtle into quads/tokens/prefixes', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse(FIX('valid.ttl'));
    expect(Array.isArray(res.quads)).toBe(true);
    expect(res.quads.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(res.tokens)).toBe(true);
    expect(res.prefixes && res.prefixes['ex']).toBe('http://example.com/');
    const hasKnows = res.quads.some(q =>
      iri(q,'p') === 'http://example.com/knows' && iri(q,'s').endsWith('/a') && iri(q,'o').endsWith('/b'));
    expect(hasKnows).toBe(true);
    // positionToken is attached to at least one quad
    const withPos = res.quads.find((q:any)=>q.positionToken);
    expect(withPos?.positionToken?.startLine).toBeGreaterThanOrEqual(1);
  });

  it('resolves @base when provided in input', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse(FIX('base.ttl'));
    expect(res.quads.length).toBe(1);
    expect(iri(res.quads[0],'s')).toBe('http://base/p');
  });

});


