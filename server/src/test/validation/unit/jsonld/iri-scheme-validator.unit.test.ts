import { parseTree } from 'jsonc-parser';
import { describe, expect, it, vi } from 'vitest';
import JsonLdIriSchemeCheck from '../../../../business/validation/jsonld/iri-scheme-validator';

vi.mock('../../../../business/validation/iana-schemes', () => ({
  getIanaSchemes: vi.fn(async () => new Set(['http', 'https', 'urn'])),
}));

function ast(text: string) {
  const parsed = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  if (!parsed) throw new Error('Expected JSON AST');
  return parsed;
}

describe('validation/jsonld: JsonLdIriSchemeCheck (unit)', () => {
  it('accepts opaque absolute URN IRIs as generic RDF IRIs', async () => {
    const text = '{"@id":"urn:prefix","urn:testFilesBranch":"main"}';
    const rule = new JsonLdIriSchemeCheck();
    await rule.init({ text, ast: ast(text) }, { strictSchemeCheck: false });

    expect(rule.run()).toHaveLength(0);
  });
});
