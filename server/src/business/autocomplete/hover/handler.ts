/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Connection,
  Hover,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { MarkupKind } from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { DataManager } from "../../../data/data-manager.js";
import type { JsonldParsedGraph } from "../../../data/irdf-parser.js";
import { findNodeAtOffset, parseTree, type Node } from "jsonc-parser";
import type {
  TermMetadata,
  TermMetadataService,
} from "../term-metadata/term-metadata-service.js";
import type { PerformanceTracer } from "../../../utils/performance-trace.js";
import { isJsonLdLikeDocument } from "../../../utils/shared/jsonld/document-detection.js";
import {
  findJsonLdContextValues,
  findJsonLdLocalContextAt,
  jsonLdStateFromResolvedContext,
  jsonStringNodeValue,
  type JsonLdLocalContextState,
} from "../../../utils/shared/jsonld/context-prefix.js";

const REMOTE_HOVER_BUDGET_MS = 1200;

interface JsonLdContextInfo {
  term: string;
  iri?: string;
  type?: string;
  container?: string[];
}

interface HoverTerm {
  prefix: string;
  term: string;
  namespaceIri?: string;
  curie: string;
  iri?: string;
  jsonLdContext?: JsonLdContextInfo;
}

function wordAt(text: string, offset: number): string | undefined {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const left =
    text.slice(0, safeOffset).match(/[A-Za-z_][\w-]*:[\w-]*$/)?.[0] ?? "";
  const right = text.slice(safeOffset).match(/^[\w-]*/)?.[0] ?? "";
  const value = `${left}${right}`;
  return value.includes(":") ? value : undefined;
}

function isHttpIri(value: string): boolean {
  return /^https?:\/\/[^\s<>"{}|^`]+$/i.test(value);
}

function findAngleBracketIriAt(
  text: string,
  offset: number,
): string | undefined {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const start = text.lastIndexOf("<", safeOffset);
  const end = text.indexOf(">", safeOffset);
  if (start < 0 || end < 0 || start > safeOffset || end < safeOffset) {
    return undefined;
  }
  const iri = text.slice(start + 1, end);
  return isHttpIri(iri) ? iri : undefined;
}

function withBudget<T>(
  promise: Promise<T>,
  fallback: T,
  ms: number,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTurtlePrefixNamespace(
  text: string,
  prefix: string,
): string | undefined {
  const escapedPrefix = escapeRegExp(prefix);
  const patterns = [
    new RegExp(
      `(?:^|\\n)\\s*@prefix\\s+${escapedPrefix}:\\s*<([^>]+)>\\s*\\.`,
      "i",
    ),
    new RegExp(`(?:^|\\n)\\s*PREFIX\\s+${escapedPrefix}:\\s*<([^>]+)>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function containsOffset(node: Node | undefined, offset: number): boolean {
  return !!node && offset >= node.offset && offset <= node.offset + node.length;
}

function isInsideContext(root: Node, text: string, node: Node): boolean {
  return findJsonLdContextValues(root, text).some((context) =>
    containsOffset(context, node.offset),
  );
}

function splitCurie(
  value: string,
): { prefix: string; term: string } | undefined {
  const match = value.match(/^([A-Za-z_][\w-]*):(.+)$/);
  if (!match) return undefined;
  const term = match[2] ?? "";
  if (!term || term.startsWith("//")) return undefined;
  return { prefix: match[1]!, term };
}

function splitIri(
  value: string,
): { namespaceIri: string; term: string } | undefined {
  const hash = value.lastIndexOf("#");
  const slash = value.lastIndexOf("/");
  const sep = Math.max(hash, slash);
  if (sep < 0 || sep === value.length - 1) return undefined;
  return { namespaceIri: value.slice(0, sep + 1), term: value.slice(sep + 1) };
}

function nodeValueContainsOffset(
  value: Node | undefined,
  offset: number,
): boolean {
  if (!value) return false;
  if (containsOffset(value, offset)) return true;
  return (value.children ?? []).some((child: Node) =>
    nodeValueContainsOffset(child, offset),
  );
}

function isTypeKey(
  root: Node,
  text: string,
  key: string | undefined,
  node: Node,
  initialContext?: JsonLdLocalContextState,
): boolean {
  if (!key) return false;
  if (key === "@type") return true;
  const active = findJsonLdLocalContextAt(root, text, node.offset, initialContext);
  return (
    active.keywordAliases.get("@type")?.has(key) ??
    active.contextMap.get(key) === "@type"
  );
}

function termForStringValue(
  root: Node,
  text: string,
  node: Node,
  value: string,
  initialContext?: JsonLdLocalContextState,
): HoverTerm | undefined {
  if (isHttpIri(value)) {
    const iriParts = splitIri(value);
    if (iriParts) {
      return {
        prefix: "@iri",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: value,
        iri: value,
      };
    }
  }

  const active = findJsonLdLocalContextAt(root, text, node.offset, initialContext);
  const parts = splitCurie(value);
  if (parts) {
    const namespaceIri = active.prefixMap.get(parts.prefix);
    return namespaceIri ? { ...parts, namespaceIri, curie: value } : undefined;
  }
  if (
    active.vocab &&
    value &&
    !value.startsWith("@") &&
    !value.includes(":") &&
    !active.contextMap.has(value)
  ) {
    return {
      prefix: "@vocab",
      term: value,
      namespaceIri: active.vocab,
      curie: value,
    };
  }
  return undefined;
}

function termForPropertyKey(
  root: Node,
  text: string,
  keyNode: Node,
  key: string,
  initialContext?: JsonLdLocalContextState,
): HoverTerm | undefined {
  if (!key || key.startsWith("@") || isInsideContext(root, text, keyNode))
    return undefined;
  if (isHttpIri(key)) {
    const iriParts = splitIri(key);
    if (iriParts) {
      return {
        prefix: "@iri",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: key,
        iri: key,
      };
    }
  }
  const active = findJsonLdLocalContextAt(root, text, keyNode.offset, initialContext);
  const parts = splitCurie(key);
  if (parts) {
    const namespaceIri = active.prefixMap.get(parts.prefix);
    return namespaceIri ? { ...parts, namespaceIri, curie: key } : undefined;
  }

  const termDef = active.terms.get(key);
  const mapped = termDef?.["@id"] ?? active.contextMap.get(key);
  if (mapped && !mapped.startsWith("@")) {
    const iriParts = splitIri(mapped);
    if (iriParts) {
      return {
        prefix: "@iri",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: key,
        iri: mapped,
        jsonLdContext: {
          term: key,
          iri: mapped,
          type: termDef?.["@type"],
          container: termDef?.["@container"],
        },
      };
    }
  }

  if (active.vocab && !key.includes(":") && !active.contextMap.has(key)) {
    return {
      prefix: "@vocab",
      term: key,
      namespaceIri: active.vocab,
      curie: key,
    };
  }
  return undefined;
}

function resolveJsonLdHoverTerm(
  document: TextDocument,
  offset: number,
  initialContext?: JsonLdLocalContextState,
): HoverTerm | undefined {
  const text = document.getText();
  const root = parseTree(text, [], {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (!root) return undefined;

  let node = findNodeAtOffset(root, offset, true);
  if (!node) return undefined;
  while (node && node.type !== "string") {
    node = node.parent;
  }
  if (!node || node.type !== "string") return undefined;

  const value = jsonStringNodeValue(text, node);
  if (!value) return undefined;

  const parent = node.parent;
  if (parent?.type === "property" && parent.children?.[0] === node) {
    return termForPropertyKey(root, text, node, value, initialContext);
  }

  if (isInsideContext(root, text, node)) return undefined;

  const property =
    parent?.type === "property"
      ? parent
      : parent?.parent?.type === "property"
        ? parent.parent
        : undefined;
  const key = jsonStringNodeValue(text, property?.children?.[0]);
  const valueNode = property?.children?.[1];
  if (
    property &&
    nodeValueContainsOffset(valueNode, offset) &&
    isTypeKey(root, text, key, node, initialContext)
  ) {
    return termForStringValue(root, text, node, value, initialContext);
  }

  if (isHttpIri(value)) {
    const iriParts = splitIri(value);
    if (iriParts) {
      return {
        prefix: "@iri",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: value,
        iri: value,
      };
    }
  }
  return undefined;
}

function findDocumentHoverTerm(
  document: TextDocument,
  offset: number,
  initialContext?: JsonLdLocalContextState,
  jsonLdLike = false,
): HoverTerm | undefined {
  const text = document.getText();
  if (jsonLdLike) {
    return resolveJsonLdHoverTerm(document, offset, initialContext);
  }

  const iri = findAngleBracketIriAt(text, offset);
  if (iri) {
    const iriParts = splitIri(iri);
    if (iriParts) {
      return {
        prefix: "@iri",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: iri,
        iri,
      };
    }
  }

  const curie = wordAt(text, offset);
  if (!curie) return undefined;
  const [prefix, term] = curie.split(":", 2);
  if (!prefix || !term) return undefined;
  const namespaceIri =
    document.languageId === "turtle"
      ? findTurtlePrefixNamespace(text, prefix)
      : undefined;
  return { prefix, term, namespaceIri, curie };
}

async function jsonLdParsedGraphFromSnapshot(
  dataManager: DataManager | undefined,
  document: TextDocument,
): Promise<JsonldParsedGraph | undefined> {
  if (!isJsonLdLikeDocument(document.uri, document.languageId, document.getText())) {
    return undefined;
  }

  const snapshot = dataManager
    ? await dataManager
        .ensureCurrentSnapshot(
          document.uri,
          document.getText(),
          document.version,
          document.languageId,
        )
        .catch(() => undefined)
    : undefined;

  if (
    !snapshot ||
    snapshot.version !== document.version ||
    snapshot.fileType !== "jsonld"
  ) {
    return undefined;
  }
  return snapshot.parsedGraph as JsonldParsedGraph;
}

function code(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function markdownForJsonLdContext(info: JsonLdContextInfo): string {
  const lines = [`**${info.term}**`];
  const summary: string[] = [];
  if (info.iri) {
    summary.push(`- **IRI:** ${code(info.iri)}`);
  }
  const jsonLd: string[] = [];
  if (info.type) jsonLd.push(`@type: ${code(info.type)}`);
  if (info.container?.length) {
    jsonLd.push(`@container: ${info.container.map(code).join(", ")}`);
  }
  if (jsonLd.length) {
    summary.push(`- **JSON-LD:** ${jsonLd.join(", ")}`);
  }
  summary.push("- **Metadata source:** JSON-LD context");
  lines.push("", ...summary);
  return lines.join("\n");
}

function appendJsonLdContextMarkdown(
  documentation: string,
  context: JsonLdContextInfo | undefined,
): string {
  if (!context || (!context.type && !context.container?.length)) {
    return documentation;
  }
  const parts: string[] = [];
  if (context.type) parts.push(`@type: ${code(context.type)}`);
  if (context.container?.length) {
    parts.push(`@container: ${context.container.map(code).join(", ")}`);
  }
  return `${documentation}\n\n**JSON-LD context**\n- ${parts.join("\n- ")}`;
}

export function registerHoverHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  termMetadata: TermMetadataService,
  tracer?: PerformanceTracer,
  dataManager?: DataManager,
): void {
  connection.onHover(async (params: any): Promise<Hover | undefined> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return undefined;
    }

    const offset = document.offsetAt(params.position);
    const jsonLdLike = isJsonLdLikeDocument(
      document.uri,
      document.languageId,
      document.getText(),
    );
    const jsonLdGraph = await jsonLdParsedGraphFromSnapshot(dataManager, document);
    const initialContext = jsonLdStateFromResolvedContext(
      jsonLdGraph?.resolvedContext,
    );
    const hoverTerm = findDocumentHoverTerm(
      document,
      offset,
      initialContext,
      jsonLdLike,
    );
    if (!hoverTerm) {
      return undefined;
    }

    const syntax: "jsonld" | "turtle" | undefined =
      jsonLdLike
        ? "jsonld"
        : document.languageId === "turtle"
          ? "turtle"
          : undefined;
    const options = {
      ...(hoverTerm.namespaceIri
        ? { namespaceIri: hoverTerm.namespaceIri }
        : {}),
      ...(syntax ? { syntax } : {}),
    };
    const cached = hoverTerm.iri
      ? termMetadata.getMetadataForIri(hoverTerm.iri, {
          ...options,
          displayName: hoverTerm.curie,
        })
      : termMetadata.getMetadata(hoverTerm.prefix, hoverTerm.term, options);
    const asyncInfo = hoverTerm.iri
      ? "getMetadataForIriAsync" in termMetadata
        ? termMetadata.getMetadataForIriAsync(hoverTerm.iri, {
            ...options,
            displayName: hoverTerm.curie,
          })
        : Promise.resolve(cached)
      : "getMetadataAsync" in termMetadata
        ? termMetadata.getMetadataAsync(
            hoverTerm.prefix,
            hoverTerm.term,
            options,
          )
        : Promise.resolve(cached);
    const info = await withBudget<TermMetadata | undefined>(
      asyncInfo,
      cached,
      REMOTE_HOVER_BUDGET_MS,
    );
    if (!info) {
      if (hoverTerm.jsonLdContext) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdownForJsonLdContext(hoverTerm.jsonLdContext),
          },
        };
      }
      return undefined;
    }

    tracer?.log("hover.term", {
      uri: params.textDocument.uri,
      curie: hoverTerm.curie,
      sources: info.sources,
    });

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: appendJsonLdContextMarkdown(
          info.documentation ?? info.detail,
          hoverTerm.jsonLdContext,
        ),
      },
    };
  });
}
