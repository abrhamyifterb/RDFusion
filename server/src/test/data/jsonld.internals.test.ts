/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseTree } from 'jsonc-parser';

import { DataFactory, Quad } from 'n3';
import { ContextExtractor } from '../../data/jsonld/context/context-extractor';
import { DefinitionExtractor } from '../../data/jsonld/definitions/definition-extractor';
import { IdRangeBuilder } from '../../data/jsonld/id-range-builder';
import { QuadPositionAttacher } from '../../data/jsonld/quad-positions/quad-position-attach';

const FIXTXT = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('jsonld internals (context/definitions/idRange/quad positions)', () => {
  const text = FIXTXT('valid.jsonld');
  const ast = parseTree(text, [], { allowTrailingComma: true, disallowComments: false })!;
  it('extracts @context term IRIs', () => {
    const map = new ContextExtractor().extract(ast, text);
    expect(map.get('ex')).toBe('http://example.com');
  });
  it('extracts @graph definitions with ranges', () => {
    const defs = new DefinitionExtractor().extract(ast, text);
    expect(defs.length).toBeGreaterThan(0);
    const first = defs[0];
    // Definitions may keep compact IRIs like "ex:a" (valid JSON-LD compaction) or expanded IRIs.
    if (typeof first.id === 'string' && first.id.startsWith('ex:')) {
      expect(first.id).toMatch(/^ex:[ab]$/);
    } else {
      expect(first.id).toMatch(/^http:\/\/example\.com\/[ab]/);
    }
    expect(first.range.start.line).toBeGreaterThanOrEqual(0); 
  });
  it('builds ID ranges and attaches quad positions', () => {
    const ctx = new ContextExtractor().extract(ast, text);
    const idRanges = new IdRangeBuilder(ctx).extract(ast, text);
    // make a quad with that subject
    const q: Quad = DataFactory.quad(
      DataFactory.namedNode('http://example.com/a'),
      DataFactory.namedNode('http://example.com/p'),
      DataFactory.namedNode('http://example.com/b'),
    );
    new QuadPositionAttacher(idRanges).attach([q]);
    expect((q as any).positionToken.startLine).toBeGreaterThan(0);
  });
});
