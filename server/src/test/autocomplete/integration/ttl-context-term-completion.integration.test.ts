/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import type { TextDocuments, TextDocumentPositionParams } from 'vscode-languageserver/node';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TtlTermCompletionProvider } from '../../../business/autocomplete/term-completion/ttl-term-completion-provider';

function docs(doc: TextDocument) {
  return ({ get: () => doc } as unknown) as TextDocuments<TextDocument>;
}

function makeProvider() {
  const fakeTermProvider = { getTermsFor: async (_p: string) => ['Person', 'name', 'Alice'] } as any;
  const metadata = {
    getMetadata: (_prefix: string, term: string) => ({
      prefix: 'ex',
      term,
      curie: `ex:${term}`,
      detail: `ex:${term}`,
      sources: ['prefix'],
      vocabulary: term === 'name'
        ? { roles: ['property'], labels: [], comments: [], types: [], domains: [], ranges: [], subClassOf: [], subPropertyOf: [], equivalentTerms: [], seeAlso: [], isDefinedBy: [], examples: [], occurrences: { subject: 0, predicate: 1, object: 0 } }
        : term === 'Person'
          ? { roles: ['class'], labels: [], comments: [], types: [], domains: [], ranges: [], subClassOf: [], subPropertyOf: [], equivalentTerms: [], seeAlso: [], isDefinedBy: [], examples: [], occurrences: { subject: 0, predicate: 0, object: 1 } }
          : { roles: ['subject'], labels: [], comments: [], types: [], domains: [], ranges: [], subClassOf: [], subPropertyOf: [], equivalentTerms: [], seeAlso: [], isDefinedBy: [], examples: [], occurrences: { subject: 1, predicate: 0, object: 0 } },
      shaclProperties: [],
    }),
    enrichCompletionItem: (item: any, _prefix: string, term: string, options: any) => ({
      ...item,
      detail: `${options.role} ex:${term}`,
    }),
  } as any;
  return new TtlTermCompletionProvider(fakeTermProvider, {} as any, {} as any, metadata);
}

describe('TtlTermCompletionProvider context-aware term completion', () => {
  it('ranks property terms first in predicate position', async () => {
    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, 'ex:Alice ex:');
    const items = await makeProvider().provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: 'ex:Alice ex:'.length } } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map(item => item.label)).toContain('name');
    expect(items.map(item => item.label)).not.toContain('Person');
    expect(items[0].label).toBe('name');
    expect(items[0].kind).toBe(CompletionItemKind.Property);
    expect(items[0].detail).toContain('predicate');
  });

  it('uses class completion kind in subject position', async () => {
    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, 'ex:');
    const items = await makeProvider().provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: 'ex:'.length } } as TextDocumentPositionParams,
      docs(doc),
    );

    const person = items.find(item => item.label === 'Person');
    const name = items.find(item => item.label === 'name');
    expect(person?.kind).toBe(CompletionItemKind.Class);
    expect(name?.kind).toBe(CompletionItemKind.Property);
    expect(items[0].label).toBe('Person');
  });

  it('uses field completion kind for selected SHACL properties', async () => {
    const fakeTermProvider = { getTermsFor: async () => ['requiredName', 'PlainClass'] } as any;
    const metadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: 'ex',
        term,
        curie: `ex:${term}`,
        detail: `ex:${term}`,
        sources: ['prefix'],
        vocabulary: term === 'PlainClass'
          ? { roles: ['class'], labels: [], comments: [], types: [], domains: [], ranges: [], subClassOf: [], subPropertyOf: [], equivalentTerms: [], seeAlso: [], isDefinedBy: [], examples: [], occurrences: { subject: 0, predicate: 0, object: 1 } }
          : { roles: ['property'], labels: [], comments: [], types: [], domains: [], ranges: [], subClassOf: [], subPropertyOf: [], equivalentTerms: [], seeAlso: [], isDefinedBy: [], examples: [], occurrences: { subject: 0, predicate: 1, object: 0 } },
        shaclProperties: term === 'requiredName' ? [{ id: 'p', targetDisplays: [] }] : [],
      }),
      enrichCompletionItem: (item: any) => item,
    } as any;
    const provider = new TtlTermCompletionProvider(fakeTermProvider, {} as any, {} as any, metadata);
    const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, 'ex:Alice ex:');

    const items = await provider.provide(
      { textDocument: { uri: doc.uri }, position: { line: 0, character: 'ex:Alice ex:'.length } } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map(item => item.label)).toEqual(['requiredName']);
    expect(items[0].kind).toBe(CompletionItemKind.Field);
  });

  it('does not offer term completions inside literals or comments', async () => {
    const literalDoc = TextDocument.create('file:///literal.ttl', 'turtle', 1, 'ex:Alice ex:name "ex:" .');
    const commentDoc = TextDocument.create('file:///comment.ttl', 'turtle', 1, 'ex:Alice ex:name "Alice" . # ex:');

    expect(await makeProvider().provide(
      { textDocument: { uri: literalDoc.uri }, position: { line: 0, character: 'ex:Alice ex:name "ex:'.length } } as TextDocumentPositionParams,
      docs(literalDoc),
    )).toEqual([]);

    expect(await makeProvider().provide(
      { textDocument: { uri: commentDoc.uri }, position: { line: 0, character: 'ex:Alice ex:name "Alice" . # ex:'.length } } as TextDocumentPositionParams,
      docs(commentDoc),
    )).toEqual([]);
  });
});
