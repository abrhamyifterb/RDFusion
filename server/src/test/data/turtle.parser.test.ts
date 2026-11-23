/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import MillianRDFParser from '../../data/turtle/ttl-parser';
import { TurtleCstToQuadsVisitor } from '../../data/turtle/cst-to-quads-visitor';


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

  it.each([
    ['double-quoted', '"double quoted"', 'double quoted'],
    ['single-quoted', "'single quoted'", 'single quoted'],
    ['long double-quoted', '"""long\ndouble quoted"""', 'long\ndouble quoted'],
    ['long single-quoted', "'''long\nsingle quoted'''", 'long\nsingle quoted'],
  ])('parses %s string literals without retaining delimiters', async (_name, lexical, expected) => {
    const parser = new MillianRDFParser();
    const res = await parser.parse([
      '@prefix ex: <http://example.com/> .',
      `ex:s ex:p ${lexical} . # adjacent comment`,
    ].join('\n'));

    expect(res.errors).toHaveLength(0);
    expect(res.quads).toHaveLength(1);
    expect(res.quads[0].object.value).toBe(expected);
    expect(res.comments?.map(comment => comment.image)).toEqual(['# adjacent comment']);
  });

  it('decodes standard Turtle character and Unicode escapes in string literals', async () => {
    const parser = new MillianRDFParser();
    const source = String.raw`@prefix ex: <http://example.com/> .
ex:s ex:p "line\nquote \" apostrophe \' slash \\ unicode \u263A \U0001F642" .`;
    const res = await parser.parse(source);

    expect(res.errors).toHaveLength(0);
    expect(res.quads).toHaveLength(1);
    expect(res.quads[0].object.value).toBe('line\nquote " apostrophe \' slash \\ unicode ☺ 🙂');
  });

  it('reports visitor conversion failures and discards partial results', async () => {
    const visit = vi.spyOn(TurtleCstToQuadsVisitor.prototype, 'visitTurtleDoc')
      .mockImplementation(() => {throw new Error('forced visitor failure');});

    try {
      const parser = new MillianRDFParser();
      const res = await parser.parse('@prefix ex: <http://example.com/> .\nex:s ex:p ex:o .');

      expect(res.errors).toHaveLength(1);
      expect(res.errors?.[0].message).toContain('Turtle graph conversion failed: forced visitor failure');
      expect(res.quads).toEqual([]);
    } finally {
      visit.mockRestore();
    }
  });

  it('does not attempt quad conversion after a semantic parse error', async () => {
    const parser = new MillianRDFParser();
    const res = await parser.parse('missing:subject missing:predicate missing:object .');

    expect(res.errors?.length).toBeGreaterThan(0);
    expect(res.errors?.some(error => error.message?.includes('Turtle graph conversion failed'))).toBe(false);
    expect(res.quads).toEqual([]);
  });

});


