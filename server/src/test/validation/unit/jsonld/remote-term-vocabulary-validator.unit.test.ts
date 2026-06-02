import { parseTree } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  CodeActionParams,
  DiagnosticSeverity,
} from "vscode-languageserver/node.js";
import { JsonLdRemoteTermVocabularyValidator } from "../../../../business/validation/jsonld/remote-term-vocabulary-validator.js";
import { RemoteTermCodeActionProvider } from "../../../../business/validation/turtle/remote-term-code-actions.js";
import { REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE } from "../../../../business/validation/remote-term-diagnostics.js";

function parsed(
  text: string,
  contextMap = new Map([["thes", "http://www.w3.org/2004/02/skos/core#"]]),
): any {
  const ast = parseTree(text, [], {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!ast) throw new Error("failed to parse JSON-LD test input");
  return { text, ast, contextMap, definitions: [], quads: [], diagnostics: [] };
}

function provider(remoteTerms?: string[]) {
  return {
    getCachedRemoteTermsForPrefix: (
      _prefix: string,
      namespaceIri?: string,
      syntax?: string,
    ) => {
      return namespaceIri && syntax === "jsonld" && remoteTerms
        ? new Set(remoteTerms)
        : undefined;
    },
  } as any;
}

describe("JsonLdRemoteTermVocabularyValidator", () => {
  it("warns and quick-fixes compact IRI property keys using cached remote vocabulary data", () => {
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:altLasbel":"x"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["altLabel", "prefLabel"]),
    );

    const diagnostics = validator.validate(parsed(text));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe(
      "thes:altLabel",
    );

    const actions = new RemoteTermCodeActionProvider().provideCodeActions({
      textDocument: { uri: "file:///data.jsonld" },
      range: diagnostics[0].range,
      context: { diagnostics: [diagnostics[0]] },
    } as CodeActionParams);
    const edit = actions[0].edit?.changes?.["file:///data.jsonld"]?.[0];

    expect(edit?.newText).toBe("thes:altLabel");
    const updated =
      text.slice(0, edit!.range.start.character) +
      edit!.newText +
      text.slice(edit!.range.end.character);
    expect(updated).toBe(
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:altLabel":"x"}',
    );
  });

  it("also checks @type compact IRI string values but ignores @context declarations", () => {
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"@type":"thes:Conceptttt"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["Concept", "ConceptScheme"]),
    );

    const diagnostics = validator.validate(parsed(text));

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe(
      "thes:Concept",
    );
    expect(diagnostics[0].range.start.character).toBe(
      text.indexOf("thes:Conceptttt"),
    );
    expect(diagnostics[0].range.end.character).toBe(
      text.indexOf("thes:Conceptttt") + "thes:Conceptttt".length,
    );
  });

  it("stays silent when the remote vocabulary is not cached", () => {
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"thes:altLasbel":"x"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(undefined),
    );

    expect(validator.validate(parsed(text))).toHaveLength(0);
  });

  it("checks @type keyword aliases using the resolved JSON-LD context map", () => {
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#","kind":"@type"},"kind":"thes:Conceptttt"}';
    const contextMap = new Map([
      ["thes", "http://www.w3.org/2004/02/skos/core#"],
      ["kind", "@type"],
    ]);
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["Concept", "ConceptScheme"]),
    );

    const diagnostics = validator.validate(parsed(text, contextMap));

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe(
      "thes:Concept",
    );
  });

  it("uses prefix mappings resolved from JSON-LD context arrays", () => {
    const text =
      '{"@context":[{"other":"http://example.com/"},{"thes":"http://www.w3.org/2004/02/skos/core#"}],"thes:altLasbel":"x"}';
    const contextMap = new Map([
      ["other", "http://example.com/"],
      ["thes", "http://www.w3.org/2004/02/skos/core#"],
    ]);
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["altLabel", "prefLabel"]),
    );

    const diagnostics = validator.validate(parsed(text, contextMap));

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe(
      "thes:altLabel",
    );
  });

  it("does not treat @id compact IRI values as vocabulary terms", () => {
    const text =
      '{"@context":{"thes":"http://www.w3.org/2004/02/skos/core#"},"@id":"thes:Conceptttt"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["Concept", "ConceptScheme"]),
    );

    expect(validator.validate(parsed(text))).toHaveLength(0);
  });

  it("uses @vocab for unprefixed JSON-LD property keys when cached vocabulary data exists", () => {
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"altLasbel":"x"}';
    const contextMap = new Map<string, string>();
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["altLabel", "prefLabel"]),
    );

    const diagnostics = validator.validate({
      ...parsed(text, contextMap),
      vocab: "http://www.w3.org/2004/02/skos/core#",
    });

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).prefix).toBe("@vocab");
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe("altLabel");

    const actions = new RemoteTermCodeActionProvider().provideCodeActions({
      textDocument: { uri: "file:///data.jsonld" },
      range: diagnostics[0].range,
      context: { diagnostics: [diagnostics[0]] },
    } as CodeActionParams);
    const edit = actions[0].edit?.changes?.["file:///data.jsonld"]?.[0];

    expect(edit?.newText).toBe("altLabel");
    const updated =
      text.slice(0, edit!.range.start.character) +
      edit!.newText +
      text.slice(edit!.range.end.character);
    expect(updated).toBe(
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"altLabel":"x"}',
    );
  });

  it("uses @vocab for unprefixed @type values but not explicitly defined context terms", () => {
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#","Known":"http://example.com/Known"},"@type":["Conceptttt","Known"]}';
    const contextMap = new Map([["Known", "http://example.com/Known"]]);
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["Concept", "ConceptScheme"]),
    );

    const diagnostics = validator.validate({
      ...parsed(text, contextMap),
      vocab: "http://www.w3.org/2004/02/skos/core#",
    });

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe("Concept");
  });

  it("does not treat non-prefix term definitions as compact IRI prefixes", () => {
    const text =
      '{"@context":{"name":"http://schema.org/name"},"name:Typoo":"x"}';
    const contextMap = new Map([["name", "http://schema.org/name"]]);
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["Thing"]),
    );

    const diagnostics = validator.validate({
      ...parsed(text, contextMap),
      prefixMap: new Map<string, string>(),
    });

    expect(diagnostics).toHaveLength(0);
  });

  it("uses the local JSON-LD context scope when validating compact IRI property keys", () => {
    const text =
      '{"@context":{"p":"http://www.w3.org/2004/02/skos/core#"},"nested":{"@context":{"p":"http://example.com/local#"},"p:altLasbel":"local"},"p:altLasbel":"remote"}';
    const validator = new JsonLdRemoteTermVocabularyValidator({
      getCachedRemoteTermsForPrefix: (
        _prefix: string,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        return namespaceIri === "http://www.w3.org/2004/02/skos/core#" &&
          syntax === "jsonld"
          ? new Set(["altLabel"])
          : undefined;
      },
    } as any);

    const diagnostics = validator.validate(
      parsed(text, new Map([["p", "http://www.w3.org/2004/02/skos/core#"]])),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.character).toBe(
      text.lastIndexOf("p:altLasbel"),
    );
    expect((diagnostics[0].data as any).namespaceIri).toBe(
      "http://www.w3.org/2004/02/skos/core#",
    );
  });

  it("does not fall back to the root context after a nested @context null reset", () => {
    const text =
      '{"@context":{"p":"http://www.w3.org/2004/02/skos/core#"},"nested":{"@context":null,"p:altLasbel":"local"},"p:altLasbel":"remote"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["altLabel", "prefLabel"]),
    );

    const diagnostics = validator.validate(
      parsed(text, new Map([["p", "http://www.w3.org/2004/02/skos/core#"]])),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.character).toBe(
      text.lastIndexOf("p:altLasbel"),
    );
  });

  it("honors nested @vocab null without resurrecting the parsed root @vocab", () => {
    const text =
      '{"@context":{"@vocab":"http://www.w3.org/2004/02/skos/core#"},"nested":{"@context":{"@vocab":null},"altLasbel":"local"},"altLasbel":"remote"}';
    const validator = new JsonLdRemoteTermVocabularyValidator(
      provider(["altLabel", "prefLabel"]),
    );

    const diagnostics = validator.validate({
      ...parsed(text, new Map<string, string>()),
      vocab: "http://www.w3.org/2004/02/skos/core#",
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.character).toBe(
      text.lastIndexOf("altLasbel"),
    );
  });

  it("uses JSON-LD 1.1 property-scoped context for wrapped object vocabulary validation", () => {
    const text =
      '{"@context":{"wrapped":{"@id":"http://example.com/wrapped","@context":{"p":"http://www.w3.org/2004/02/skos/core#"}}},"wrapped":{"p:prefLable":""},"p:prefLable":"outside"}';
    const validator = new JsonLdRemoteTermVocabularyValidator({
      getCachedRemoteTermsForPrefix: (
        _prefix: string,
        namespaceIri?: string,
        syntax?: string,
      ) => {
        return namespaceIri === "http://www.w3.org/2004/02/skos/core#" &&
          syntax === "jsonld"
          ? new Set(["prefLabel"])
          : undefined;
      },
    } as any);

    const diagnostics = validator.validate(
      parsed(text, new Map<string, string>()),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].range.start.character).toBe(
      text.indexOf("p:prefLable"),
    );
    expect((diagnostics[0].data as any).namespaceIri).toBe(
      "http://www.w3.org/2004/02/skos/core#",
    );
  });
});
