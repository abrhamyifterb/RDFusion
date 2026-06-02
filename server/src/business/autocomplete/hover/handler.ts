import type {
  Connection,
  Hover,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { MarkupKind } from "vscode-languageserver/node.js";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { findNodeAtOffset, parseTree, type Node } from "jsonc-parser";
import type {
  TermMetadata,
  TermMetadataService,
} from "../term-metadata/term-metadata-service.js";
import type { PerformanceTracer } from "../../../utils/performance-trace.js";
import {
  findJsonLdContextValues,
  findJsonLdLocalContextAt,
  jsonStringNodeValue,
} from "../../../utils/shared/jsonld/context-prefix.js";

const REMOTE_HOVER_BUDGET_MS = 1200;

interface HoverTerm {
  prefix: string;
  term: string;
  namespaceIri?: string;
  curie: string;
}

function wordAt(text: string, offset: number): string | undefined {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const left =
    text.slice(0, safeOffset).match(/[A-Za-z_][\w-]*:[\w-]*$/)?.[0] ?? "";
  const right = text.slice(safeOffset).match(/^[\w-]*/)?.[0] ?? "";
  const value = `${left}${right}`;
  return value.includes(":") ? value : undefined;
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
  return (value.children ?? []).some((child) =>
    nodeValueContainsOffset(child, offset),
  );
}

function isTypeKey(
  root: Node,
  text: string,
  key: string | undefined,
  node: Node,
): boolean {
  if (!key) return false;
  if (key === "@type") return true;
  const active = findJsonLdLocalContextAt(root, text, node.offset);
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
): HoverTerm | undefined {
  const active = findJsonLdLocalContextAt(root, text, node.offset);
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
): HoverTerm | undefined {
  if (!key || key.startsWith("@") || isInsideContext(root, text, keyNode))
    return undefined;
  const active = findJsonLdLocalContextAt(root, text, keyNode.offset);
  const parts = splitCurie(key);
  if (parts) {
    const namespaceIri = active.prefixMap.get(parts.prefix);
    return namespaceIri ? { ...parts, namespaceIri, curie: key } : undefined;
  }

  const mapped = active.contextMap.get(key);
  if (mapped && !mapped.startsWith("@")) {
    const iriParts = splitIri(mapped);
    if (iriParts) {
      return {
        prefix: "@vocab",
        term: iriParts.term,
        namespaceIri: iriParts.namespaceIri,
        curie: key,
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
    return termForPropertyKey(root, text, node, value);
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
    isTypeKey(root, text, key, node)
  ) {
    return termForStringValue(root, text, node, value);
  }
  return undefined;
}

function findDocumentHoverTerm(
  document: TextDocument,
  offset: number,
): HoverTerm | undefined {
  const text = document.getText();
  if (document.languageId === "jsonld") {
    return resolveJsonLdHoverTerm(document, offset);
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

export function registerHoverHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  termMetadata: TermMetadataService,
  tracer?: PerformanceTracer,
): void {
  connection.onHover(async (params): Promise<Hover | undefined> => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return undefined;
    }

    const offset = document.offsetAt(params.position);
    const hoverTerm = findDocumentHoverTerm(document, offset);
    if (!hoverTerm) {
      return undefined;
    }

    const syntax: "jsonld" | "turtle" | undefined =
      document.languageId === "jsonld"
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
    const cached = termMetadata.getMetadata(
      hoverTerm.prefix,
      hoverTerm.term,
      options,
    );
    const asyncInfo =
      "getMetadataAsync" in termMetadata
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
        value: info.documentation ?? info.detail,
      },
    };
  });
}
