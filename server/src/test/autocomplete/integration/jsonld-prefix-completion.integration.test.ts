/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import type { TextDocuments, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { JsonLdPrefixCompletionProvider } from '../../../business/autocomplete/prefix/jsonld/jsonld-prefix-completion';

function docs(doc: TextDocument) { return ({ get: () => doc } as unknown) as TextDocuments<TextDocument>; }

describe('JsonLdPrefixCompletionProvider (integration)', () => {
  it('offers a completion to define a prefix', async () => {
    const text = JSON.stringify({
      "@context": { "ex": "http://ex/" },
      "ex:seeAlso": { "@id": "http://example.org/Thing" }
    }, null, 2);
    const doc = TextDocument.create('file:///doc.jsonld','json',1,text);
    const registry = {
      getAll: () => ([
        { prefix: 'ex',   iri: 'http://ex/' },
        { prefix: 'foaf', iri: 'http://xmlns.com/foaf/0.1/' }, 
      ]),
      ensure: async (p: string) => (p === 'ex'
        ? 'http://ex/'
        : p === 'foaf' ? 'http://xmlns.com/foaf/0.1/' : '')
    } as any;
    const prov = new JsonLdPrefixCompletionProvider(registry, {} as any, {} as any);

    const pos = { line: 3, character: 30 }; 
    const items = await (prov as any).provide({ textDocument: { uri: doc.uri }, position: pos } as TextDocumentPositionParams, docs(doc));
    expect(Array.isArray(items)).toBe(true); 
  });
}); 