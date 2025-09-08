/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Range, Position, DiagnosticSeverity } from 'vscode-languageserver';
import XsdLexicalRule from '../../../../business/validation/turtle/literal/rules/xsd-datatype';


const R = () => Range.create(Position.create(0,0), Position.create(0,1));

describe('validation/turtle/literal: XsdLexicalRule (unit)', () => {
  it('flags invalid lexical for xsd:integer', () => {
    const rule = new XsdLexicalRule();
    rule.init([
      { value: '"3.14"', datatype: 'http://www.w3.org/2001/XMLSchema#integer', range: R() } as any,
      { value: '"42"',   datatype: 'http://www.w3.org/2001/XMLSchema#integer', range: R() } as any
    ]);

    const diags = rule.run();
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe(DiagnosticSeverity.Error);
    expect(diags[0].message).toMatch(/Invalid lexical form/i);
  });
});
