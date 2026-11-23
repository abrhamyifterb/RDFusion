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
    const withPos = res.quads.find((q:any)=>q.positionToken);
    expect(withPos?.positionToken?.startLine).toBeGreaterThanOrEqual(1);
  });

  it('resolves @base when provided in input', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse(FIX('base.ttl'));
    expect(res.quads.length).toBe(1);
    expect(iri(res.quads[0],'s')).toBe('http://base/p');
  });

  it('retains Turtle comments without treating hashes in IRIs or literals as comments', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse([
      '# document comment',
      '@prefix ex: <http://example.com/#> .',
      'ex:s ex:p "a # inside a literal" ; # inline comment',
      '  # predicate comment',
      '  ex:q ex:o .',
      '# footer comment',
    ].join('\n'));

    expect(res.comments?.map(comment => comment.image)).toEqual([
      '# document comment',
      '# inline comment',
      '# predicate comment',
      '# footer comment',
    ]);
    expect(res.comments?.every(comment => comment.startOffset >= 0)).toBe(true);
  });

  it('reports visitor conversion failures and discards partial quads', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse([
      '@prefix ex: <http://example.com/> .',
      'ex:complete ex:p ex:o .',
      "ex:unsupported ex:p '''line one",
      "line two''' .",
    ].join('\n'));

    expect(res.errors).toHaveLength(1);
    expect(res.errors?.[0].message).toContain('Turtle graph conversion failed');
    expect(res.quads).toEqual([]);
  });

  it('does not attempt quad conversion after a semantic parse error', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse('missing:subject missing:predicate missing:object .');

    expect(res.errors?.length).toBeGreaterThan(0);
    expect(res.errors?.some(error => error.message?.includes('Turtle graph conversion failed'))).toBe(false);
    expect(res.quads).toEqual([]);
  });

});


