/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Range, Position, DiagnosticSeverity } from 'vscode-languageserver';
import LanguageTagRule from '../../../../business/validation/turtle/literal/rules/language-tag';


const R = () => Range.create(Position.create(0,0), Position.create(0,1));

describe('validation/turtle/literal: LanguageTagRule (unit)', () => {
  it('warns on invalid BCP-47 language tags', () => {
    const rule = new LanguageTagRule();
    rule.init([
      { value: '"hi"', language: 'bad_tag', range: R() } as any,
      { value: '"hello"', language: 'en', range: R() } as any
    ]);

    const diags = rule.run();
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diags[0].message).toMatch(/Invalid BCP-47/i);
  });
});
