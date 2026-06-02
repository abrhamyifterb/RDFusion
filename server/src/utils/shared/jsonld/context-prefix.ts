import type { Node } from "jsonc-parser";
import type { TermDef } from "../../../data/jsonld/active-context-resolver";

function rawNodeText(text: string, node: Node | undefined): string | undefined {
  return node ? text.slice(node.offset, node.offset + node.length) : undefined;
}

export function jsonStringNodeValue(
  text: string,
  node: Node | undefined,
): string | undefined {
  if (!node || node.type !== "string") return undefined;
  const raw = rawNodeText(text, node);
  if (!raw?.startsWith('"') || !raw.endsWith('"')) return undefined;
  
  if (raw.includes("\\")) return undefined;
  return raw.slice(1, -1);
}

function isContextProperty(rootText: string, node: Node | undefined): boolean {
  return (
    node?.type === "property" &&
    jsonStringNodeValue(rootText, node.children?.[0]) === "@context"
  );
}

export function findJsonLdContextValues(
  root: Node | undefined,
  text: string,
): Node[] {
  const values: Node[] = [];
  const walk = (node: Node | undefined) => {
    if (!node) return;
    if (isContextProperty(text, node)) {
      const value = node.children?.[1];
      if (value) values.push(value);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return values;
}

export function findJsonLdContextObjects(
  root: Node | undefined,
  text: string,
): Node[] {
  const objects: Node[] = [];
  const collect = (value: Node | undefined) => {
    if (!value) return;
    if (value.type === "object") {
      objects.push(value);
      return;
    }
    if (value.type === "array") {
      for (const item of value.children ?? []) {
        if (item.type === "object") objects.push(item);
      }
    }
  };
  for (const value of findJsonLdContextValues(root, text)) collect(value);
  return objects;
}

export function findJsonLdContextObject(
  root: Node | undefined,
  text: string,
): Node | undefined {
  return findJsonLdContextObjects(root, text)[0];
}

function valueAsStringOrId(
  text: string,
  value: Node | undefined,
): string | undefined {
  if (value?.type === "string") {
    return jsonStringNodeValue(text, value);
  }
  if (value?.type === "object") {
    for (const prop of value.children ?? []) {
      if (prop.type !== "property") continue;
      if (jsonStringNodeValue(text, prop.children?.[0]) === "@id") {
        return jsonStringNodeValue(text, prop.children?.[1]);
      }
    }
  }
  return undefined;
}

function resolveTermIriValue(
  value: string | undefined,
  state: JsonLdLocalContextState,
): string | undefined {
  if (value === undefined || value.startsWith("@")) {
    return value;
  }
  const colon = value.indexOf(":");
  if (colon > 0) {
    const prefix = value.slice(0, colon);
    const suffix = value.slice(colon + 1);
    const base = state.prefixMap.get(prefix);
    return base ? `${base}${suffix}` : value;
  }
  return state.vocab ? `${state.vocab}${value}` : value;
}

function objectBooleanProperty(
  text: string,
  value: Node | undefined,
  key: string,
): boolean | undefined {
  if (value?.type !== "object") return undefined;
  for (const prop of value.children ?? []) {
    if (prop.type !== "property") continue;
    if (jsonStringNodeValue(text, prop.children?.[0]) === key) {
      const raw = rawNodeText(text, prop.children?.[1]);
      if (raw === "true") return true;
      if (raw === "false") return false;
    }
  }
  return undefined;
}

export function isJsonLdGenDelim(value: string): boolean {
  return /[:/?#[\]@]$/.test(value);
}

export function isJsonLdPrefixTermDefinition(
  term: string,
  def: Pick<TermDef, "@id" | "@prefix"> | undefined,
): boolean {
  const iri = def?.["@id"];
  if (
    !term ||
    term.includes(":") ||
    term.includes("/") ||
    !iri ||
    iri.startsWith("@")
  )
    return false;
  if (def?.["@prefix"] === false) return false;
  if (def?.["@prefix"] === true) return true;
  return isJsonLdGenDelim(iri) || iri.startsWith("_:");
}

function isLocalPrefixDefinition(
  text: string,
  term: string,
  value: Node | undefined,
  iri: string | undefined,
): boolean {
  if (!iri || term.includes(":") || term.includes("/") || iri.startsWith("@"))
    return false;
  const explicitPrefix = objectBooleanProperty(text, value, "@prefix");
  if (explicitPrefix === false) return false;
  if (explicitPrefix === true) return true;
  return isJsonLdGenDelim(iri) || iri.startsWith("_:");
}

function resolveVocabValue(
  value: string | undefined,
  prefixes: Map<string, string>,
): string | undefined {
  if (!value) return undefined;
  const colon = value.indexOf(":");
  if (colon > 0) {
    const prefix = value.slice(0, colon);
    const suffix = value.slice(colon + 1);
    const base = prefixes.get(prefix);
    if (base) return `${base}${suffix}`;
  }
  return value;
}

export interface JsonLdLocalContextState {
  contextMap: Map<string, string>;
  prefixMap: Map<string, string>;
  vocab?: string;
  keywordAliases: Map<string, Set<string>>;
  scopedContextByTerm: Map<string, Node>;
  /**
   * True once an inline @context has been applied on the ancestor path. This
   * lets callers distinguish "no local context information" from an explicit
   * local context reset such as "@context": null.
   */
  hasContext: boolean;
}

function cloneState(state: JsonLdLocalContextState): JsonLdLocalContextState {
  return {
    contextMap: new Map(state.contextMap),
    prefixMap: new Map(state.prefixMap),
    vocab: state.vocab,
    keywordAliases: new Map(
      Array.from(state.keywordAliases.entries(), ([keyword, aliases]) => [
        keyword,
        new Set(aliases),
      ]),
    ),
    scopedContextByTerm: new Map(state.scopedContextByTerm),
    hasContext: state.hasContext,
  };
}

function removeAlias(state: JsonLdLocalContextState, term: string): void {
  for (const aliases of state.keywordAliases.values()) {
    aliases.delete(term);
  }
}

function addAlias(
  state: JsonLdLocalContextState,
  keyword: string,
  term: string,
): void {
  let aliases = state.keywordAliases.get(keyword);
  if (!aliases) {
    aliases = new Set<string>();
    state.keywordAliases.set(keyword, aliases);
  }
  aliases.add(term);
}

function objectPropertyValue(
  text: string,
  object: Node | undefined,
  key: string,
): Node | undefined {
  if (object?.type !== "object") return undefined;
  for (const prop of object.children ?? []) {
    if (prop.type !== "property") continue;
    if (jsonStringNodeValue(text, prop.children?.[0]) === key) {
      return prop.children?.[1];
    }
  }
  return undefined;
}

function applyContextObject(
  state: JsonLdLocalContextState,
  context: Node,
  text: string,
): void {
  for (const entry of context.children ?? []) {
    if (entry.type !== "property") continue;
    const key = jsonStringNodeValue(text, entry.children?.[0]);
    if (!key) continue;
    const value = entry.children?.[1];

    if (key === "@vocab") {
      if (rawNodeText(text, value) === "null") {
        state.vocab = undefined;
        continue;
      }
      const raw = jsonStringNodeValue(text, value);
      state.vocab =
        raw === undefined
          ? state.vocab
          : resolveVocabValue(raw, state.prefixMap);
      continue;
    }

    if (key.startsWith("@")) continue;

    const rawValue = rawNodeText(text, value);
    if (rawValue === "null") {
      state.contextMap.delete(key);
      state.prefixMap.delete(key);
      state.scopedContextByTerm.delete(key);
      removeAlias(state, key);
      continue;
    }

    const scopedContext = objectPropertyValue(text, value, "@context");
    const idNode = objectPropertyValue(text, value, "@id");
    const iri = resolveTermIriValue(valueAsStringOrId(text, value), state);
    if (rawNodeText(text, idNode) === "null") {
      state.contextMap.delete(key);
      state.prefixMap.delete(key);
      removeAlias(state, key);
      if (scopedContext) {
        state.scopedContextByTerm.set(key, scopedContext);
      } else {
        state.scopedContextByTerm.delete(key);
      }
      continue;
    }
    if (iri === undefined) {
      if (scopedContext) {
        state.scopedContextByTerm.set(key, scopedContext);
      } else {
        state.scopedContextByTerm.delete(key);
      }
      continue;
    }

    state.contextMap.set(key, iri);
    if (scopedContext) {
      state.scopedContextByTerm.set(key, scopedContext);
    } else {
      state.scopedContextByTerm.delete(key);
    }
    removeAlias(state, key);
    if (iri.startsWith("@")) {
      addAlias(state, iri, key);
      state.prefixMap.delete(key);
      continue;
    }

    if (isLocalPrefixDefinition(text, key, value, iri)) {
      state.prefixMap.set(key, iri);
    } else {
      state.prefixMap.delete(key);
    }
  }
}

function applyContextValueToState(
  state: JsonLdLocalContextState,
  value: Node | undefined,
  text: string,
): void {
  if (!value) return;
  state.hasContext = true;
  if (rawNodeText(text, value) === "null") {
    state.contextMap.clear();
    state.prefixMap.clear();
    state.keywordAliases.clear();
    state.scopedContextByTerm.clear();
    state.vocab = undefined;
    return;
  }
  if (value.type === "object") {
    applyContextObject(state, value, text);
    return;
  }
  if (value.type === "array") {
    for (const item of value.children ?? []) {
      applyContextValueToState(state, item, text);
    }
  }
}

function applyObjectContext(
  state: JsonLdLocalContextState,
  objectNode: Node,
  text: string,
): void {
  if (objectNode.type !== "object") return;
  for (const entry of objectNode.children ?? []) {
    if (isContextProperty(text, entry)) {
      applyContextValueToState(state, entry.children?.[1], text);
    }
  }
}

function nodeContainsOffset(node: Node | undefined, offset: number): boolean {
  return !!node && offset >= node.offset && offset <= node.offset + node.length;
}

/**
 * Lightweight local active-context resolver for editor helpers. It applies
 * inline @context declarations on ancestor objects of the requested offset.
 * This intentionally avoids remote context loading and full scoped-context
 * processing; the JSON-LD parser remains the authority for full expansion.
 */
export function findJsonLdLocalContextAt(
  root: Node | undefined,
  text: string,
  offset: number,
): JsonLdLocalContextState {
  const state: JsonLdLocalContextState = {
    contextMap: new Map<string, string>(),
    prefixMap: new Map<string, string>(),
    keywordAliases: new Map<string, Set<string>>(),
    scopedContextByTerm: new Map<string, Node>(),
    hasContext: false,
  };

  const walk = (
    node: Node | undefined,
    current: JsonLdLocalContextState,
  ): JsonLdLocalContextState | undefined => {
    if (!node || !nodeContainsOffset(node, offset)) return undefined;
    const next = cloneState(current);
    if (node.type === "object") {
      applyObjectContext(next, node, text);
    }
    if (node.type === "property") {
      const keyNode = node.children?.[0];
      const valueNode = node.children?.[1];
      const key = jsonStringNodeValue(text, keyNode);
      if (nodeContainsOffset(keyNode, offset)) {
        return walk(keyNode, next) ?? next;
      }
      let valueState = next;
      if (
        key &&
        valueNode &&
        nodeContainsOffset(valueNode, offset) &&
        !isContextProperty(text, node)
      ) {
        const scopedContext = next.scopedContextByTerm.get(key);
        if (scopedContext) {
          valueState = cloneState(next);
          applyContextValueToState(valueState, scopedContext, text);
        }
      }
      if (valueNode) {
        const hit = walk(valueNode, valueState);
        if (hit) return hit;
      }
      return next;
    }
    for (const child of node.children ?? []) {
      const hit = walk(child, next);
      if (hit) return hit;
    }
    return next;
  };

  return walk(root, state) ?? state;
}

export function findJsonLdPrefixNamespaceAt(
  root: Node | undefined,
  text: string,
  prefix: string,
  offset: number,
): string | undefined {
  return findJsonLdLocalContextAt(root, text, offset).prefixMap.get(prefix);
}

export function findJsonLdPrefixNamespacesAt(
  root: Node | undefined,
  text: string,
  offset: number,
): Map<string, string> {
  return findJsonLdLocalContextAt(root, text, offset).prefixMap;
}

export function findJsonLdDefaultVocabAt(
  root: Node | undefined,
  text: string,
  offset: number,
): string | undefined {
  return findJsonLdLocalContextAt(root, text, offset).vocab;
}

export function findJsonLdKeywordAliasesAt(
  root: Node | undefined,
  text: string,
  keyword: string,
  offset: number,
): Set<string> {
  return (
    findJsonLdLocalContextAt(root, text, offset).keywordAliases.get(keyword) ??
    new Set<string>()
  );
}

export function findJsonLdPrefixNamespace(
  root: Node | undefined,
  text: string,
  prefix: string,
): string | undefined {
  const contexts = findJsonLdContextObjects(root, text);
  for (let i = contexts.length - 1; i >= 0; i -= 1) {
    const context = contexts[i];
    for (const entry of context?.children ?? []) {
      if (entry.type !== "property") continue;
      const key = jsonStringNodeValue(text, entry.children?.[0]);
      if (key !== prefix) continue;
      const value = entry.children?.[1];
      const iri = valueAsStringOrId(text, value);
      return isLocalPrefixDefinition(text, key, value, iri) ? iri : undefined;
    }
  }
  return undefined;
}

export function findJsonLdPrefixNamespaces(
  root: Node | undefined,
  text: string,
): Map<string, string> {
  const prefixes = new Map<string, string>();
  for (const context of findJsonLdContextObjects(root, text)) {
    for (const entry of context.children ?? []) {
      if (entry.type !== "property") continue;
      const key = jsonStringNodeValue(text, entry.children?.[0]);
      if (!key || key.startsWith("@")) continue;
      const value = entry.children?.[1];
      const iri = valueAsStringOrId(text, value);
      if (isLocalPrefixDefinition(text, key, value, iri)) {
        prefixes.set(key, iri!);
      }
    }
  }
  return prefixes;
}

export function findJsonLdDefaultVocab(
  root: Node | undefined,
  text: string,
): string | undefined {
  let vocab: string | undefined;
  const prefixes = new Map<string, string>();
  for (const context of findJsonLdContextObjects(root, text)) {
    for (const entry of context.children ?? []) {
      if (entry.type !== "property") continue;
      const key = jsonStringNodeValue(text, entry.children?.[0]);
      const value = entry.children?.[1];
      if (!key) continue;
      if (key === "@vocab") {
        const raw = jsonStringNodeValue(text, value);
        vocab = resolveVocabValue(raw, prefixes);
        continue;
      }
      if (key.startsWith("@")) continue;
      const iri = valueAsStringOrId(text, value);
      if (isLocalPrefixDefinition(text, key, value, iri)) {
        prefixes.set(key, iri!);
      }
    }
  }
  return vocab;
}

export function findJsonLdKeywordAliases(
  root: Node | undefined,
  text: string,
  keyword: string,
): Set<string> {
  const aliases = new Set<string>();
  for (const context of findJsonLdContextObjects(root, text)) {
    for (const entry of context.children ?? []) {
      if (entry.type !== "property") continue;
      const key = jsonStringNodeValue(text, entry.children?.[0]);
      if (!key || key.startsWith("@")) continue;
      if (valueAsStringOrId(text, entry.children?.[1]) === keyword) {
        aliases.add(key);
      }
    }
  }
  return aliases;
}
