import { describe, it, expect } from 'vitest';
import { computeLineColumn } from '../../data/compute-line-column';

describe('computeLineColumn', () => {
  it('computes line/character from offset', () => {
    const text = 'abc\n012345\nxyz';
    expect(computeLineColumn(text, 0)).toEqual({ line: 0, character: 0 });
    expect(computeLineColumn(text, 4)).toEqual({ line: 1, character: 0 });
    expect(computeLineColumn(text, 6)).toEqual({ line: 1, character: 2 });
  });
});
