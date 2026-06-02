/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  CompletionItemKind,
  type TextDocuments,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JsonLdTermCompletionProvider } from "../../../business/autocomplete/term-completion/jsonld-term-completion-provider";
import type { PrefixRegistry } from "../../../business/autocomplete/prefix/prefix-registry";

function docs(doc: TextDocument) {
  return { get: () => doc } as unknown as TextDocuments<TextDocument>;
}

describe("JsonLdTermCompletionProvider (integration)", () => {
  it('suggests terms after "ex:" ', async () => {
    const fakeTermProvider = {
      getTermsFor: async (_p: string) => ["name", "age"],
    } as any;
    const fakeRegistry = {
      ensure: async (_p: string) => "http://ex/",
    } as any as PrefixRegistry;

    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );

    const text = '{"@context":{"ex":"http://ex/"},"ex:": ""}';
    const doc = TextDocument.create("file:///doc.jsonld", "json", 1, text);

    const keyIndex = text.indexOf('"ex:"');
    const posChar = keyIndex + 4;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.some((i: any) => i.label === "name")).toBe(true);
  });

  it("uses JSON-LD @context namespace when enriching completion metadata for custom aliases", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      enrichCompletionItem: (
        item: any,
        prefix: string,
        term: string,
        options: any,
      ) => ({
        ...item,
        detail: `${prefix}:${term} → ${options.namespaceIri}`,
        data: { options },
      }),
    } as any;

    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:alt":""}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"thes:alt"') + '"thes:alt'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "thes",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
    expect(items[0].detail).toContain("http://www.w3.org/2004/02/skos/core#");
    expect(items[0].data.options.syntax).toBe("jsonld");
  });

  it("uses property-key context to prefer properties and avoid class-only terms", async () => {
    const fakeTermProvider = {
      getTermsFor: async () => ["Concept", "altLabel", "hiddenLabel"],
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: "thes",
        term,
        curie: `thes:${term}`,
        iri: `http://www.w3.org/2004/02/skos/core#${term}`,
        sources: ["remote"],
        detail: `thes:${term}`,
        vocabulary: {
          iri: `http://www.w3.org/2004/02/skos/core#${term}`,
          roles: term === "Concept" ? ["class"] : ["property"],
          labels: [term],
          comments: [],
          types: term === "Concept" ? ["owl:Class"] : ["rdf:Property"],
          domains: [],
          ranges: [],
          subClassOf: [],
          subPropertyOf: [],
          equivalentTerms: [],
          seeAlso: [],
          isDefinedBy: [],
          examples: [],
          occurrences: { subject: 0, predicate: 0, object: 0 },
        },
      }),
      enrichCompletionItem: (item: any) => item,
    } as any;

    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:":"x"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"thes:"') + '"thes:'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map((item: any) => item.label)).toEqual([
      "altLabel",
      "hiddenLabel",
    ]);
    expect(
      items.every((item: any) => item.kind === CompletionItemKind.Property),
    ).toBe(true);
    expect(
      items.every(
        (item: any) => item.data.rdfusionContext.role === "predicate",
      ),
    ).toBe(true);
  });

  it("uses @type value context to prefer class/resource terms and avoid property-only terms", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["Concept", "ConceptScheme", "altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: "thes",
        term,
        curie: `thes:${term}`,
        iri: `http://www.w3.org/2004/02/skos/core#${term}`,
        sources: ["remote"],
        detail: `thes:${term}`,
        vocabulary: {
          iri: `http://www.w3.org/2004/02/skos/core#${term}`,
          roles: term === "altLabel" ? ["property"] : ["class"],
          labels: [term],
          comments: [],
          types: term === "altLabel" ? ["rdf:Property"] : ["owl:Class"],
          domains: [],
          ranges: [],
          subClassOf: [],
          subPropertyOf: [],
          equivalentTerms: [],
          seeAlso: [],
          isDefinedBy: [],
          examples: [],
          occurrences: { subject: 0, predicate: 0, object: 0 },
        },
      }),
      enrichCompletionItem: (
        item: any,
        _prefix: string,
        _term: string,
        options: any,
      ) => ({ ...item, data: { ...item.data, options } }),
    } as any;

    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"@type":"thes:Con"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"thes:Con"') + '"thes:Con'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "thes",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
    expect(items.map((item: any) => item.label)).toEqual([
      "Concept",
      "ConceptScheme",
    ]);
    expect(
      items.every((item: any) => item.kind === CompletionItemKind.Class),
    ).toBe(true);
    expect(
      items.every((item: any) => item.data.rdfusionContext.role === "type"),
    ).toBe(true);
    expect(
      items.every((item: any) => item.data.options.role === "object"),
    ).toBe(true);
  });

  it("does not offer vocabulary terms in arbitrary JSON-LD string literals", async () => {
    const fakeTermProvider = { getTermsFor: async () => ["Concept"] } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:prefLabel":"thes:Con"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.lastIndexOf('"thes:Con"') + '"thes:Con'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items).toEqual([]);
  });

  it("resolves prefix mappings from JSON-LD context arrays", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":[{"ignored":"http://example.com/"},{"thes":"http://www.w3.org/2004/02/skos/core#"}],"thes:alt":""}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"thes:alt"') + '"thes:alt'.length;

    await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "thes",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
  });

  it("treats JSON-LD @type keyword aliases as type-value completion positions", async () => {
    const fakeTermProvider = {
      getTermsFor: async () => ["Concept", "altLabel"],
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: "thes",
        term,
        curie: `thes:${term}`,
        iri: `http://www.w3.org/2004/02/skos/core#${term}`,
        sources: ["remote"],
        detail: `thes:${term}`,
        vocabulary: {
          iri: `http://www.w3.org/2004/02/skos/core#${term}`,
          roles: term === "altLabel" ? ["property"] : ["class"],
          labels: [term],
          comments: [],
          types: term === "altLabel" ? ["rdf:Property"] : ["owl:Class"],
          domains: [],
          ranges: [],
          subClassOf: [],
          subPropertyOf: [],
          equivalentTerms: [],
          seeAlso: [],
          isDefinedBy: [],
          examples: [],
          occurrences: { subject: 0, predicate: 0, object: 0 },
        },
      }),
      enrichCompletionItem: (item: any) => item,
    } as any;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#","kind":"@type"},"kind":"thes:Con"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.lastIndexOf('"thes:Con"') + '"thes:Con'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map((item: any) => item.label)).toEqual(["Concept"]);
    expect(items[0].data.rdfusionContext.role).toBe("type");
  });

  it("supports hyphenated JSON-LD compact IRI prefixes during completion", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":{"my-skos":"http://www.w3.org/2004/02/skos/core#"},"my-skos:alt":""}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"my-skos:alt"') + '"my-skos:alt'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "my-skos",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
    expect(items.map((item: any) => item.label)).toEqual(["altLabel"]);
  });

  it("uses @vocab for unprefixed JSON-LD property-key completion", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel", "Concept"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: "@vocab",
        term,
        curie: term,
        iri: `http://www.w3.org/2004/02/skos/core#${term}`,
        sources: ["remote"],
        detail: term,
        vocabulary: {
          iri: `http://www.w3.org/2004/02/skos/core#${term}`,
          roles: term === "Concept" ? ["class"] : ["property"],
          labels: [term],
          comments: [],
          types: term === "Concept" ? ["owl:Class"] : ["rdf:Property"],
          domains: [],
          ranges: [],
          subClassOf: [],
          subPropertyOf: [],
          equivalentTerms: [],
          seeAlso: [],
          isDefinedBy: [],
          examples: [],
          occurrences: { subject: 0, predicate: 0, object: 0 },
        },
      }),
      enrichCompletionItem: (item: any) => item,
    } as any;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"alt":""}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"alt"') + '"alt'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "@vocab",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
    expect(items.map((item: any) => item.label)).toEqual(["altLabel"]);
    expect(items[0].insertText).toBe("altLabel");
  });

  it("uses @vocab for unprefixed JSON-LD @type value completion", async () => {
    const fakeTermProvider = {
      getTermsFor: async () => ["Concept", "altLabel"],
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const fakeMetadata = {
      getMetadata: (_prefix: string, term: string) => ({
        prefix: "@vocab",
        term,
        curie: term,
        iri: `http://www.w3.org/2004/02/skos/core#${term}`,
        sources: ["remote"],
        detail: term,
        vocabulary: {
          iri: `http://www.w3.org/2004/02/skos/core#${term}`,
          roles: term === "altLabel" ? ["property"] : ["class"],
          labels: [term],
          comments: [],
          types: term === "altLabel" ? ["rdf:Property"] : ["owl:Class"],
          domains: [],
          ranges: [],
          subClassOf: [],
          subPropertyOf: [],
          equivalentTerms: [],
          seeAlso: [],
          isDefinedBy: [],
          examples: [],
          occurrences: { subject: 0, predicate: 0, object: 0 },
        },
      }),
      enrichCompletionItem: (item: any) => item,
    } as any;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
      fakeMetadata,
    );
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"@type":"Con"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"Con"') + '"Con'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items.map((item: any) => item.label)).toEqual(["Concept"]);
    expect(items[0].insertText).toBe("Concept");
  });

  it("does not treat ordinary non-prefix term definitions as compact IRI prefixes during completion", async () => {
    const fakeTermProvider = { getTermsFor: async () => ["Thing"] } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text = '{"@context":{"name":"http://schema.org/name"},"name:Th":""}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"name:Th"') + '"name:Th'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items).toEqual([]);
  });

  it("uses the nearest local JSON-LD context for completion instead of a later/global mapping", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return namespaceIri === "http://example.com/local#"
          ? ["localName"]
          : ["altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":{"p":"http://www.w3.org/2004/02/skos/core#"},"nested":{"@context":{"p":"http://example.com/local#"},"p:local":""}}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"p:local"') + '"p:local'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "p",
      namespaceIri: "http://example.com/local#",
      syntax: "jsonld",
    });
    expect(items.map((item: any) => item.label)).toEqual(["localName"]);
  });

  it("does not use registry fallback inside a nested @context null reset", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel"];
      },
    } as any;
    const fakeRegistry = {
      getIri: (prefix: string) =>
        prefix === "p" ? "http://www.w3.org/2004/02/skos/core#" : undefined,
    } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text = '{"nested":{"@context":null,"p:alt":""}}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"p:alt"') + '"p:alt'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("does not use an inherited @vocab after nested @vocab null", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["altLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"nested":{"@context":{"@vocab":null},"alt":""}}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.lastIndexOf('"alt"') + '"alt'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(items).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("uses JSON-LD 1.1 property-scoped context for wrapped object completion", async () => {
    const calls: any[] = [];
    const fakeTermProvider = {
      getTermsFor: async (
        prefix: string,
        _connection: any,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        calls.push({ prefix, namespaceIri, syntax });
        return ["prefLabel"];
      },
    } as any;
    const fakeRegistry = { getIri: () => undefined } as any as PrefixRegistry;
    const prov = new JsonLdTermCompletionProvider(
      fakeTermProvider,
      fakeRegistry,
      {} as any,
      {} as any,
    );
    const text =
      '{"@context":{"wrapped":{"@id":"http://example.com/wrapped","@context":{"p":"http://www.w3.org/2004/02/skos/core#"}}},"wrapped":{"p:pref":""}}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const posChar = text.indexOf('"p:pref"') + '"p:pref'.length;

    const items = await (prov as any).provide(
      {
        textDocument: { uri: doc.uri },
        position: { line: 0, character: posChar },
      } as TextDocumentPositionParams,
      docs(doc),
    );

    expect(calls[0]).toEqual({
      prefix: "p",
      namespaceIri: "http://www.w3.org/2004/02/skos/core#",
      syntax: "jsonld",
    });
    expect(items.map((item: any) => item.label)).toEqual(["prefLabel"]);
  });
});
