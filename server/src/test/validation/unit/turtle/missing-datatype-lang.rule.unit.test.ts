/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Range, Position, DiagnosticSeverity } from 'vscode-languageserver';
import MissingDatatypeOrLang from '../../../../business/validation/turtle/literal/rules/missing-datatype-lang';


const R = () => Range.create(Position.create(0,0), Position.create(0,1));

describe('validation/turtle/literal: MissingDatatypeOrLang (unit)', () => {
  it('warns when a quoted literal has neither datatype nor language', () => {
    const rule = new MissingDatatypeOrLang();
    rule.init([
      { value: '"Alice"', range: R() } as any,
      { value: '"Bob"', datatype: 'http://www.w3.org/2001/XMLSchema#string', range: R() } as any,
      { value: '"Hola"', language: 'es', range: R() } as any
    ]);

    const diags = rule.run();
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diags[0].message).toMatch(/missing a datatype or language tag/i);
  });
});
