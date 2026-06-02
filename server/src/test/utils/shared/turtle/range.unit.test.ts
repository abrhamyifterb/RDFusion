import { describe, expect, it } from 'vitest';
import { tokenToLspRange } from '../../../../utils/shared/turtle/range.js';

describe('tokenToLspRange', () => {
  it('converts 1-based inclusive single-line token coordinates to an end-exclusive LSP range', () => {
    const range = tokenToLspRange({
      image: 'skos:altLasbel',
      startLine: 2,
      startColumn: 6,
      endLine: 2,
      endColumn: 19,
    });

    expect(range.start).toEqual({ line: 1, character: 5 });
    expect(range.end).toEqual({ line: 1, character: 19 });
  });

  it('falls back to inclusive endColumn conversion when token image is unavailable', () => {
    const range = tokenToLspRange({
      startLine: 4,
      startColumn: 3,
      endLine: 4,
      endColumn: 9,
    });

    expect(range.start).toEqual({ line: 3, character: 2 });
    expect(range.end).toEqual({ line: 3, character: 9 });
  });
});
