/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { parseAst } from "./helpers";
import { IriExpectationIndex } from "../../../business/autocomplete/prefix/jsonld/iri-expectation-index";

function stringNodes(ast: any): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "string") out.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(ast);
  return out;
}

describe("IriExpectationIndex (unit)", () => {
  it("marks string values IriExpectationIndex", () => {
    const text = JSON.stringify({
      "@context": { ex: "http://ex/" },
      "@id": "http://ex/a",
      "ex:p": { "@id": "http://example.org/Homer" },
    });
    const ast = parseAst(text);
    const idx = new IriExpectationIndex();
    idx.init({ text, ast });
    expect(idx.looksAbsoluteIri("http://example.org/Homer", ast)).toBe(true);
  });

  it("does not inherit @type:@id coercion after a nested @context null reset", () => {
    const text = JSON.stringify({
      "@context": { ref: { "@id": "http://example.com/ref", "@type": "@id" } },
      nested: {
        "@context": null,
        ref: "http://example.com/not-an-iri-position",
      },
    });
    const ast = parseAst(text);
    const idx = new IriExpectationIndex();
    idx.init({ text, ast });
    const valueNode = stringNodes(ast).find(
      (node) =>
        text.slice(node.offset + 1, node.offset + node.length - 1) ===
        "http://example.com/not-an-iri-position",
    );

    expect(valueNode).toBeTruthy();
    expect(idx.isIriValueStringNode(valueNode)).toBe(false);
  });
});
