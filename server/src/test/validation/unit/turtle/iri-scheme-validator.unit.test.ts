 
import { describe, it, expect, vi } from 'vitest';
import type { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IriSchemeValidator } from '../../../../business/validation/turtle/Iri-scheme-validator';


// Mock the IANA schemes to avoid network
vi.mock('../../iana-schemes', () => ({
  getIanaSchemes: vi.fn(async () => new Set(['http','https']))
}));

function docs(uri: string, text: string) {
  return { get: () => TextDocument.create(uri, 'turtle', 1, text) } as unknown as TextDocuments<TextDocument>;
}

describe('validation/turtle: IriSchemeValidator (unit)', () => {
  it('flags unknown IRI schemes', async () => {
    const uri = 'file:///in.ttl';
    const text = '<fake://x> <http://ex/p> <http://ex/o> .';
    const v = new IriSchemeValidator(docs(uri, text));
    const diags = await v.validate(uri, {});
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0].message.toLowerCase()).toContain('scheme');
  });

  it('accepts known schemes', async () => {
    const uri = 'file:///ok.ttl';
    const text = '<http://ex/s> <http://ex/p> <https://ex/o> .';
    const v = new IriSchemeValidator(docs(uri, text));
    const diags = await v.validate(uri, {});
    expect(diags.some(d => d.severity === 1)).toBe(false); 
  });
});
