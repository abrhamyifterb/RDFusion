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
});
