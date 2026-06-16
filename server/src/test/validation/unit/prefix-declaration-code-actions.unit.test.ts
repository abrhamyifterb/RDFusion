import { describe, expect, it, vi } from 'vitest';
import { CodeActionParams, Diagnostic, DiagnosticSeverity, Range, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IFetcher } from '../../../business/autocomplete/prefix/ifetcher';
import { PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';
import { PrefixDeclarationCodeActionProvider } from '../../../business/validation/prefix-declaration-code-actions';

const makeRegistry = (map: Record<string, string>) => {
  const fetcher = {
    getPrefixes: vi.fn(async (url: string) => {
      if (url.endsWith('popular/all.file.json')) return {};
      const key = url.split('/').pop()!.replace('.file.json', '');
      return map[key] ? { [key]: map[key] } : {};
    }),
  } as unknown as IFetcher;
  return new PrefixRegistry(fetcher);
};

const documentsWith = (doc: TextDocument) => ({
  get: (uri: string) => uri === doc.uri ? doc : undefined,
}) as unknown as TextDocuments<TextDocument>;

const diagnostic = (message: string, code = 'turtleParseError'): Diagnostic => Diagnostic.create(
  Range.create(0, 0, 0, 5),
  message,
  DiagnosticSeverity.Error,
  code,
  'RDFusion',
);

const params = (uri: string, diag: Diagnostic): CodeActionParams => ({
  textDocument: { uri },
  range: diag.range,
  context: { diagnostics: [diag] },
});

describe('PrefixDeclarationCodeActionProvider', () => {
  it('declares a Turtle prefix from prefix.cc when an undeclared prefix diagnostic is present', async () => {
    const uri = 'file:///data.ttl';
    const doc = TextDocument.create(uri, 'turtle', 1, 'foaf:Person a foaf:Class .\n');
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const actions = await provider.provideCodeActions(params(uri, diagnostic('Undefined prefix: foaf')));

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain('from prefix.cc');
    expect(actions[0].isPreferred).toBe(true);
    expect(actions[0].edit?.changes?.[uri]?.[0].newText).toBe('@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n');
  });

  it('generates a placeholder Turtle declaration when prefix.cc has no match', async () => {
    const uri = 'file:///data.ttl';
    const doc = TextDocument.create(uri, 'turtle', 1, 'local:Thing a local:Class .\n');
    const provider = new PrefixDeclarationCodeActionProvider(makeRegistry({}), documentsWith(doc));

    const actions = await provider.provideCodeActions(params(uri, diagnostic('Undefined prefix: local')));

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toContain('not found in prefix.cc');
    expect(actions[0].edit?.changes?.[uri]?.[0].newText).toBe('@prefix local: <https://example.org/local#> .\n');
  });

  it('adds a JSON-LD @context mapping from prefix.cc', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, '{\n  "foaf:name": "Abrham"\n}\n');
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const actions = await provider.provideCodeActions(params(
      uri,
      diagnostic('Undefined prefix "foaf" in property "foaf:name".', 'undefinedPrefix'),
    ));

    const edit = actions[0].edit?.changes?.[uri]?.[0];
    expect(edit?.newText).toContain('"@context"');
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
  });

  it('adds a JSON-LD mapping to the nearest local @context', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, `{
  "@context": {
    "schema": "https://schema.org/"
  },
  "items": [
    {
      "@context": {
        "ex": "https://example.org/"
      },
      "foaf:name": "Abrham"
    }
  ]
}
`);
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const offset = doc.getText().indexOf('foaf:name');
    const diag = diagnostic('Undefined prefix "foaf" in property "foaf:name".', 'undefinedPrefix');
    diag.range = Range.create(doc.positionAt(offset), doc.positionAt(offset + 'foaf'.length));

    const actions = await provider.provideCodeActions(params(uri, diag));

    const edit = actions[0].edit?.changes?.[uri]?.[0];
    expect(actions[0].title).toContain('nearest existing @context');
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
  });

  it('extends a JSON-LD remote context as a local context array', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, `{
  "@context": "https://example.org/context.jsonld",
  "foaf:name": "Abrham"
}
`);
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const offset = doc.getText().indexOf('foaf:name');
    const diag = diagnostic('Undefined prefix "foaf" in property "foaf:name".', 'undefinedPrefix');
    diag.range = Range.create(doc.positionAt(offset), doc.positionAt(offset + 'foaf'.length));

    const actions = await provider.provideCodeActions(params(uri, diag));

    const edit = actions[0].edit?.changes?.[uri]?.[0];
    expect(edit?.newText).toContain('"https://example.org/context.jsonld"');
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
  });
  it('adds a JSON-LD mapping to an ancestor @context instead of creating a sibling-local context', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, `{
  "@context": {
    "ex": "http://example.org/"
  },
  "@graph": [
    {
      "@context": {
        "schema": "https://schema.org/"
      },
      "schema:name": "Already local"
    },
    {
      "@id": "ex:Homer",
      "@type": "foaf:Person",
      "foaf:name": "Homer Simpson"
    }
  ]
}
`);
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const offset = doc.getText().lastIndexOf('foaf:Person');
    const diag = diagnostic('Undefined prefix "foaf" in IRI "foaf:Person".', 'undefinedPrefix');
    diag.range = Range.create(doc.positionAt(offset), doc.positionAt(offset + 'foaf'.length));

    const actions = await provider.provideCodeActions(params(uri, diag));

    const edit = actions[0].edit?.changes?.[uri]?.[0];
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
    expect(edit?.range.start.line).toBe(3);
  });


  it('does not add a second comma when appending to a JSON-LD context object with a trailing comma', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, `{
  "@context": {
    "schema": "https://schema.org/",
  },
  "foaf:name": "Abrham"
}
`);
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const offset = doc.getText().indexOf('foaf:name');
    const diag = diagnostic('Undefined prefix "foaf" in property "foaf:name".', 'undefinedPrefix');
    diag.range = Range.create(doc.positionAt(offset), doc.positionAt(offset + 'foaf'.length));

    const actions = await provider.provideCodeActions(params(uri, diag));
    const edit = actions[0].edit?.changes?.[uri]?.[0];

    expect(edit?.newText.startsWith(',')).toBe(false);
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
  });

  it('does not add a second comma when appending to a JSON-LD context array with a trailing comma', async () => {
    const uri = 'file:///data.jsonld';
    const doc = TextDocument.create(uri, 'jsonld', 1, `{
  "@context": [
    null,
  ],
  "foaf:name": "Abrham"
}
`);
    const provider = new PrefixDeclarationCodeActionProvider(
      makeRegistry({ foaf: 'http://xmlns.com/foaf/0.1/' }),
      documentsWith(doc),
    );

    const offset = doc.getText().indexOf('foaf:name');
    const diag = diagnostic('Undefined prefix "foaf" in property "foaf:name".', 'undefinedPrefix');
    diag.range = Range.create(doc.positionAt(offset), doc.positionAt(offset + 'foaf'.length));

    const actions = await provider.provideCodeActions(params(uri, diag));
    const edit = actions[0].edit?.changes?.[uri]?.[0];

    expect(edit?.newText.startsWith(',')).toBe(false);
    expect(edit?.newText).toContain('"foaf": "http://xmlns.com/foaf/0.1/"');
  });

});
