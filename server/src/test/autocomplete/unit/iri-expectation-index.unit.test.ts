/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst } from './helpers';
import { IriExpectationIndex } from '../../../business/autocomplete/prefix/jsonld/iri-expectation-index';

describe('IriExpectationIndex (unit)', () => {
  it('marks string values IriExpectationIndex', () => {
    const text = JSON.stringify({
      "@context": { "ex":"http://ex/" },
      "@id": "http://ex/a",
      "ex:p": { "@id": "http://example.org/Homer" }
    });
    const ast = parseAst(text);
    const idx = new IriExpectationIndex();
    idx.init({ text, ast });
    expect(idx.looksAbsoluteIri('http://example.org/Homer', ast)).toBe(true);
  });
});
