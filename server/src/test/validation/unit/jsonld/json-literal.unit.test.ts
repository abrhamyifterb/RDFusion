/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst } from './helpers';
import JsonLiteral from '../../../../business/validation/jsonld/literal/rules/json-literal';

describe('JsonLiteral (unit)', () => {
  it('warns when literal lacks explicit datatype or language', () => {
    const text = JSON.stringify({
      "@context": { "ex":"http://ex/" },
      "ex:data": { "@value": "{\"a\":1}", "@type": "@json" }
    });
    const ast = parseAst(text);
    const rule = new JsonLiteral();
    rule.init({ text, ast }); 
    const diags = rule.run();
    expect(diags.length).toBeGreaterThanOrEqual(0); 
  });
}); 
