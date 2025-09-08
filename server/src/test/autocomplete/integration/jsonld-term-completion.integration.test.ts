/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import type { TextDocuments, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { JsonLdTermCompletionProvider } from '../../../business/autocomplete/term-completion/jsonld-term-completion-provider';
import type { PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';

function docs(doc: TextDocument) {
  return ({ get: () => doc } as unknown) as TextDocuments<TextDocument>;
}

describe('JsonLdTermCompletionProvider (integration)', () => {
  it('suggests terms after "ex:" ', async () => {
    const fakeTermProvider = { getTermsFor: async (_p: string) => ['name', 'age'] } as any;
    const fakeRegistry = { ensure: async (_p: string) => 'http://ex/' } as any as PrefixRegistry;

    const prov = new JsonLdTermCompletionProvider(fakeTermProvider, fakeRegistry, {} as any, {} as any);

    const text = '{"@context":{"ex":"http://ex/"},"ex:": ""}';
    const doc = TextDocument.create('file:///doc.jsonld', 'json', 1, text);

    const keyIndex = text.indexOf('"ex:"');
    const posChar = keyIndex + 4; 

    const items = await (prov as any).provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: posChar } } as TextDocumentPositionParams,
      docs(doc)
    );

    expect(items.some((i: any) => i.label === 'name')).toBe(true);
  });
});
