/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { registerHoverHandler } from "../../../business/autocomplete/hover/handler";

function register(doc: TextDocument, termMetadata: any) {
  let hoverCallback: any;
  const connection = {
    onHover: (cb: any) => {
      hoverCallback = cb;
    },
  } as any;
  const documents = { get: () => doc } as any;
  registerHoverHandler(connection, documents, termMetadata);
  return hoverCallback;
}

describe("registerHoverHandler", () => {
  it("returns shared term metadata for CURIE hover", async () => {
    const doc = TextDocument.create(
      "file:///doc.ttl",
      "turtle",
      1,
      'ex:Alice ex:name "Alice" .',
    );
    const termMetadata = {
      getMetadata: (prefix: string, term: string) =>
        prefix === "ex" && term === "name"
          ? {
              documentation: "**ex:name**\n\nIRI: `http://example.com/name`",
              detail: "ex:name",
              sources: ["prefix"],
            }
          : undefined,
      getMetadataAsync: async (prefix: string, term: string) =>
        prefix === "ex" && term === "name"
          ? {
              documentation: "**ex:name**\n\nIRI: `http://example.com/name`",
              detail: "ex:name",
              sources: ["prefix"],
            }
          : undefined,
    } as any;

    const hoverCallback = register(doc, termMetadata);
    const character = "ex:Alice ex:na".length;
    const hover = await hoverCallback({
      textDocument: { uri: doc.uri },
      position: { line: 0, character },
    });

    expect(hover.contents.value).toContain("http://example.com/name");
  });

  it("uses JSON-LD property-scoped context for hover inside wrapped objects", async () => {
    const calls: any[] = [];
    const text =
      '{"@context":{"wrapped":{"@id":"http://example.com/wrapped","@context":{"p":"http://www.w3.org/2004/02/skos/core#"}}},"wrapped":{"p:prefLabel":"x"}}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const termMetadata = {
      getMetadata: (prefix: string, term: string, options: any) => {
        calls.push({ sync: true, prefix, term, options });
        return {
          documentation:
            "**prefLabel**\n\nIRI: `http://www.w3.org/2004/02/skos/core#prefLabel`",
          detail: "p:prefLabel",
          sources: ["remote"],
        };
      },
      getMetadataAsync: async (prefix: string, term: string, options: any) => {
        calls.push({ sync: false, prefix, term, options });
        return {
          documentation:
            "**prefLabel**\n\nIRI: `http://www.w3.org/2004/02/skos/core#prefLabel`",
          detail: "p:prefLabel",
          sources: ["remote"],
        };
      },
    } as any;

    const hoverCallback = register(doc, termMetadata);
    const character = text.indexOf("p:prefLabel") + "p:pref".length;
    const hover = await hoverCallback({
      textDocument: { uri: doc.uri },
      position: { line: 0, character },
    });

    expect(hover.contents.value).toContain("prefLabel");
    expect(calls[0]).toMatchObject({
      prefix: "p",
      term: "prefLabel",
      options: {
        namespaceIri: "http://www.w3.org/2004/02/skos/core#",
        syntax: "jsonld",
      },
    });
  });

  it("uses @vocab for unprefixed JSON-LD property hover", async () => {
    const calls: any[] = [];
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"prefLabel":"x"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const termMetadata = {
      getMetadata: (prefix: string, term: string, options: any) => {
        calls.push({ prefix, term, options });
        return {
          documentation: "**prefLabel**\n\nRemote label",
          detail: "prefLabel",
          sources: ["remote"],
        };
      },
      getMetadataAsync: async (prefix: string, term: string, options: any) => ({
        documentation: `**${prefix}:${term}**`,
        detail: term,
        sources: ["remote"],
        options,
      }),
    } as any;

    const hoverCallback = register(doc, termMetadata);
    const character = text.indexOf("prefLabel") + "pref".length;
    const hover = await hoverCallback({
      textDocument: { uri: doc.uri },
      position: { line: 0, character },
    });

    expect(hover.contents.value).toContain("prefLabel");
    expect(calls[0]).toMatchObject({
      prefix: "@vocab",
      term: "prefLabel",
      options: {
        namespaceIri: "http://www.w3.org/2004/02/skos/core#",
        syntax: "jsonld",
      },
    });
  });

  it("resolves ordinary JSON-LD context term hover to the mapped remote IRI", async () => {
    const calls: any[] = [];
    const iri = "http://www.w3.org/2004/02/skos/core#prefLabel";
    const text = `{"@context":{"label":"${iri}"},"label":"x"}`;
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const termMetadata = {
      getMetadataForIri: (value: string, options: any) => {
        calls.push({ value, options });
        return {
          documentation: "**prefLabel**\n\nMapped label",
          detail: "prefLabel",
          sources: ["remote"],
        };
      },
      getMetadataForIriAsync: async (value: string, options: any) => ({
        documentation: `**${value}**`,
        detail: value,
        sources: ["remote"],
        options,
      }),
    } as any;

    const hoverCallback = register(doc, termMetadata);
    const character = text.lastIndexOf("label") + "lab".length;
    const hover = await hoverCallback({
      textDocument: { uri: doc.uri },
      position: { line: 0, character },
    });

    expect(hover.contents.value).toContain("prefLabel");
    expect(calls[0]).toMatchObject({
      value: iri,
      options: {
        displayName: "label",
        namespaceIri: "http://www.w3.org/2004/02/skos/core#",
        syntax: "jsonld",
      },
    });
  });

  it('resolves context term hover through @vocab-relative @id values', async () => {
    const calls: any[] = [];
    const iri = "http://www.w3.org/2004/02/skos/core#prefLabel";
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#","label":{"@id":"prefLabel"}},"label":"x"}';
    const doc = TextDocument.create("file:///doc.jsonld", "jsonld", 1, text);
    const termMetadata = {
      getMetadataForIri: (value: string, options: any) => {
        calls.push({ value, options });
        return {
          documentation: "**prefLabel**\n\nMapped label through @vocab",
          detail: "prefLabel",
          sources: ["remote"],
        };
      },
      getMetadataForIriAsync: async (value: string, options: any) => ({
        documentation: `**${value}**`,
        detail: value,
        sources: ["remote"],
        options,
      }),
    } as any;

    const hoverCallback = register(doc, termMetadata);
    const character = text.lastIndexOf("label") + "lab".length;
    const hover = await hoverCallback({
      textDocument: { uri: doc.uri },
      position: { line: 0, character },
    });

    expect(hover.contents.value).toContain("prefLabel");
    expect(calls[0]).toMatchObject({
      value: iri,
      options: {
        displayName: "label",
        namespaceIri: "http://www.w3.org/2004/02/skos/core#",
        syntax: "jsonld",
      },
    });
  });

});
