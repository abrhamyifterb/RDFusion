/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import type { TextDocuments, Connection, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TtlPrefixCompletionProvider } from '../../../business/autocomplete/prefix/turtle/ttl-prefix-completion';

function mockConnection() {
  return {
    workspace: { applyEdit: vi.fn(async () => ({})) }
  } as unknown as Connection;
}
function docs(doc: TextDocument) {
  return ({ get: () => doc } as unknown) as TextDocuments<TextDocument>;
}

describe('TtlPrefixCompletionProvider (integration)', () => {
  it('suggests prefixes', async () => {
    const registry = {
      getAll: () => ([
        { prefix: 'ex', iri: 'http://ex/' },
        { prefix: 'foaf', iri: 'http://xmlns.com/foaf/0.1/' },
      ]),
      ensure: vi.fn(async (p: string) => (p === 'ex' ? 'http://ex/' : ''))
    } as any;

    const conn = mockConnection();
    const cfg = { turtle: { autocomplete: { prefixDeclaration: true } } } as any;
    const prov = new TtlPrefixCompletionProvider(registry, conn, cfg);

    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, '');
    const items = await (prov as any).provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: 1 } } as TextDocumentPositionParams,
      docs(doc)
    );
    expect(items.length).toBeGreaterThan(0);
  });
});
