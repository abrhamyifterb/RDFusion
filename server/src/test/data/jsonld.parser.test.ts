/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { term, iri } from './helpers';
import { JsonLdParser } from '../../data/jsonld/jsonld-parser';

const FIXTXT = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('data/jsonld: JsonLdParser', () => {
  it('parses valid JSON-LD into quads with context/definitions and no diagnostics', async () => {
    const parser = new JsonLdParser();
    const out = await parser.parse(FIXTXT('valid.jsonld'));
    expect(out.text).toBeTypeOf('string');
    expect(out.ast).toBeTruthy();
    expect(out.quads.length).toBeGreaterThanOrEqual(3);
    expect(out.diagnostics.length).toBe(0);
    expect(out.contextMap.get('ex')).toBe('http://example.com/');
    expect(out.prefixMap?.get('ex')).toBe('http://example.com/');

    const age = out.quads.find(q => iri(q,'p')==='http://example.com/age') as any;
    expect(age).toBeTruthy();
    if (age?.object?.datatype) {
      expect(term(age.object.datatype)).toBe('http://www.w3.org/2001/XMLSchema#integer');
    }

    const anyPos = out.quads.find((q:any) => q.positionToken);
    expect(anyPos?.positionToken?.startLine).toBeGreaterThanOrEqual(1);
  });

  it('resolves @base / relative IRIs when provided', async () => {
    const parser = new JsonLdParser();
    const out = await parser.parse(FIXTXT('base.jsonld'));
    const hit = out.quads.find(q =>
      iri(q,'s')==='http://base/rel' && iri(q,'p')==='http://base/p' && iri(q,'o')==='http://base/rel2');
    expect(hit).toBeTruthy();
  });

  it('produces diagnostics for bad JSON-LD', async () => {
    const parser = new JsonLdParser();
    const out = await parser.parse(FIXTXT('invalid.jsonld'));
    expect(out.diagnostics.length).toBeGreaterThan(0);
  });

  it('tracks JSON-LD 1.1 prefix definitions and @vocab separately from ordinary terms', async () => {
    const parser = new JsonLdParser();
    const out = await parser.parse(JSON.stringify({
      '@context': {
        schema: 'https://schema.org/',
        '@vocab': 'schema:',
        name: 'https://schema.org/name'
      },
      'name': 'Alice'
    }));

    expect(out.contextMap.get('schema')).toBe('https://schema.org/');
    expect(out.contextMap.get('name')).toBe('https://schema.org/name');
    expect(out.prefixMap?.get('schema')).toBe('https://schema.org/');
    expect(out.prefixMap?.has('name')).toBe(false);
    expect(out.vocab).toBe('https://schema.org/');
  });

});
