/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst } from './helpers';
import NonStringIdCheck from '../../../../business/validation/jsonld/semantic/rules/non-string-id';

describe('NonStringId (unit)', () => {
  it('errors on non-string @id', () => {
    const text = JSON.stringify({ "@id": 123 });
    const ast = parseAst(text);
    const rule = new NonStringIdCheck();
    rule.init({ text, ast });
    const diags = rule.run();
    expect(diags.some(d => /@id.*string/i.test(d.message))).toBe(true);
  });
});
