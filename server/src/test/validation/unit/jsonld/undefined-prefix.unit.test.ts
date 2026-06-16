/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { parseAst, ctxMapFrom } from './helpers';
import UndefinedPrefix from '../../../../business/validation/jsonld/semantic/rules/undefined-prefix';

describe('UndefinedPrefix (unit)', () => {
  it('errors on undefined prefix in property key', () => {
    const obj = { "@context": { "ex": "http://ex/" }, "px:prop": "x" };
    const text = JSON.stringify(obj);
    const rule = new UndefinedPrefix();
    rule.init({ text, ast: parseAst(text), prefixMap: ctxMapFrom(obj["@context"] as any) });
    const diags = rule.run();
    expect(diags.some(d => /Undefined prefix/i.test(d.message))).toBe(true);
  });

  it('respects prefixes declared in a local JSON-LD @context array', async () => {
    const text = JSON.stringify({
      '@context': { schema: 'https://schema.org/' },
      nested: {
        '@context': [null, { foaf: 'http://xmlns.com/foaf/0.1/' }],
        'foaf:name': 'Abrham',
      },
    });
    const rule = new UndefinedPrefix();
    await rule.init({ text, ast: parseAst(text), prefixMap: ctxMapFrom({ schema: 'https://schema.org/' } as any) });

    expect(rule.run()).toHaveLength(0);
  });

  it('honors JSON-LD @context null resets when checking prefixes', async () => {
    const text = JSON.stringify({
      '@context': { foaf: 'http://xmlns.com/foaf/0.1/' },
      nested: {
        '@context': null,
        'foaf:name': 'Abrham',
      },
    });
    const rule = new UndefinedPrefix();
    await rule.init({ text, ast: parseAst(text), prefixMap: ctxMapFrom({ foaf: 'http://xmlns.com/foaf/0.1/' } as any) });

    expect(rule.run()).toHaveLength(1);
  });
});
