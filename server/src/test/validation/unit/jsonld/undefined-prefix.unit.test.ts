/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst, ctxMapFrom } from './helpers';
import UndefinedPrefix from '../../../../business/validation/jsonld/semantic/rules/undefined-prefix';

describe('UndefinedPrefix (unit)', () => {
  it('errors on undefined prefix in property key', () => {
    const obj = { "@context": { "ex": "http://ex/" }, "px:prop": "x" };
    const text = JSON.stringify(obj);
    const rule = new UndefinedPrefix();
    rule.init({ text, ast: parseAst(text), contextMap: ctxMapFrom(obj["@context"] as any) });
    const diags = rule.run();
    expect(diags.some(d => /Undefined prefix/i.test(d.message))).toBe(true);
  });
});
