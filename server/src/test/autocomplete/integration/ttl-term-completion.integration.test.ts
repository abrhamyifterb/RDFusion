/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import type { TextDocuments, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TtlTermCompletionProvider } from '../../../business/autocomplete/term-completion/ttl-term-completion-provider';

function docs(doc: TextDocument) {
  return ({ get: () => doc } as unknown) as TextDocuments<TextDocument>;
}

describe('TtlTermCompletionProvider (integration)', () => {
  it('suggests terms for a known prefix', async () => {
    const fakeTermProvider = { getTermsFor: async (_p: string) => ['name', 'knows'] } as any;

    const prov = new TtlTermCompletionProvider(fakeTermProvider, {} as any, {} as any);
    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, 'ex:');
    const items = await (prov as any).provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: 3 } } as TextDocumentPositionParams,
      docs(doc)
    );

    expect(items.some((i: any) => i.label === 'name')).toBe(true);
    expect(items.some((i: any) => i.label === 'knows')).toBe(true);
  });

  it('passes document-declared namespace IRIs into term lookup', async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ['Thing'];
      },
    } as any;

    const prov = new TtlTermCompletionProvider(fakeTermProvider, {} as any, {} as any);
    const text = '@prefix skos: <http://local.example/vocab#> .\n\nskos:Th';
    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, text);
    const offset = text.indexOf('skos:Th') + 'skos:Th'.length;
    const items = await (prov as any).provide(
      { textDocument: { uri: doc.uri }, position: doc.positionAt(offset) } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map((item: any) => item.label)).toEqual(['Thing']);
    expect(calls[0]).toEqual({
      prefix: 'skos',
      namespaceIri: 'http://local.example/vocab#',
      syntax: 'turtle',
    });
  });

});
