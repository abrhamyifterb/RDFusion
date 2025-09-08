/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { RDFParser } from '../../data/rdf-parser';


describe('data/RDFParser router', () => {
  it('routes to turtle', async () => {
    const p = new RDFParser();
    const res = await p.parse('@prefix ex: <http://ex/> . ex:a ex:p ex:b .', 'turtle');
    expect(res && Array.isArray((res as any).quads)).toBe(true);
  });
  it('routes to jsonld', async () => {
    const p = new RDFParser();
    const res = await p.parse('{ "@context": { "ex":"http://ex/" }, "@id":"ex:a" }', 'jsonld');
    expect(res && Array.isArray((res as any).quads)).toBe(true);
  });
  it('throws for unknown type', async () => {
    const p = new RDFParser();
    await expect(p.parse('foo', 'unknown' as any)).rejects.toBeTruthy();
  });
});
