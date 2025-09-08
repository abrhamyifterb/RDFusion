/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst } from './helpers';
import LanguageTag from '../../../../business/validation/jsonld/literal/rules/language-tag';

describe('LanguageTag (unit)', () => {
  it('warns on invalid BCP-47 tags', () => {
    const text = JSON.stringify({ "@context": { "ex":"http://ex/" }, "ex:name": { "@value":"hi", "@language":"verybadtag" } });
    const rule = new LanguageTag();
    rule.init({ text, ast: parseAst(text) });
    const diags = rule.run();
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message).toMatch(/bcp-47/i);
  });
});
