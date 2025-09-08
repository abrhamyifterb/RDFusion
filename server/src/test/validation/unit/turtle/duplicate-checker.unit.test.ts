/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { DuplicateChecker } from '../../../../business/validation/turtle/duplicate-finder';

function pos(line: number) {
  return {
    startLine: line, startColumn: 1,
    endLine: line, endColumn: 10
  };
}

describe('validation/turtle: DuplicateChecker (unit)', () => {
  it('warns once per occurrence of a duplicate triple', async () => {
    const parsed = {
      quads: [
        { subject: { value: 's' }, predicate: { value: 'p' }, object: { value: 'o' }, positionToken: pos(1) },
        { subject: { value: 's' }, predicate: { value: 'p' }, object: { value: 'o' }, positionToken: pos(3) },
        { subject: { value: 's2' }, predicate: { value: 'p2' }, object: { value: 'o2' }, positionToken: pos(5) }
      ],
      tokens: [], errors: []
    } as any;

    const checker = new DuplicateChecker();
    const diags = await checker.validate(parsed);
    const warns = diags.filter(d => d.severity === DiagnosticSeverity.Warning);
    expect(warns.length).toBe(2);
    expect(warns[0].message).toMatch(/Duplicate triple/i);
  });
});
