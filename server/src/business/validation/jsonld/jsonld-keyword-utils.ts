import type { Node } from 'jsonc-parser';
import {
  findJsonLdKeywordAliases,
  findJsonLdLocalContextAt,
  jsonLdStateFromResolvedContext,
  type JsonLdLocalContextState,
} from '../../../utils/shared/jsonld/context-prefix.js';
import type { ResolvedContext } from '../../../data/jsonld/active-context-resolver.js';
import { nodeText, walkAst } from './syntax/utils.js';

export interface JsonLdSpan {
  start: number;
  end: number;
}

export function jsonStringValue(text: string, node: Node | undefined): string | undefined {
  if (node?.type !== 'string') return undefined;
  try {
    return JSON.parse(nodeText(text, node));
  } catch {
    return undefined;
  }
}

export function propertyKeyName(text: string, node: Node | undefined): string | undefined {
  return jsonStringValue(text, node?.children?.[0]);
}


export function activeJsonLdContextAt(
  ast: Node | undefined,
  text: string,
  offset: number,
  resolvedContext?: ResolvedContext,
): JsonLdLocalContextState {
  return findJsonLdLocalContextAt(
    ast,
    text,
    offset,
    jsonLdStateFromResolvedContext(resolvedContext),
  );
}

export function isJsonLdKeywordAt(
  ast: Node | undefined,
  text: string,
  key: string | undefined,
  offset: number,
  keyword: string,
  resolvedContext?: ResolvedContext,
): boolean {
  if (!key) return false;
  if (key === keyword) return true;
  const active = activeJsonLdContextAt(ast, text, offset, resolvedContext);
  return (
    active.keywordAliases.get(keyword)?.has(key) ??
    active.contextMap.get(key) === keyword
  );
}

export function keywordNames(ast: Node, text: string, keyword: string): Set<string> {
  const names = new Set<string>([keyword]);
  for (const alias of findJsonLdKeywordAliases(ast, text, keyword)) {
    names.add(alias);
  }
  return names;
}

export function collectContextValueSpans(ast: Node, text: string): JsonLdSpan[] {
  const spans: JsonLdSpan[] = [];
  walkAst(ast, node => {
    if (node?.type !== 'property' || !Array.isArray(node.children) || node.children.length < 2) return;
    if (propertyKeyName(text, node) !== '@context') return;
    const value = node.children[1];
    if (value) spans.push({ start: value.offset, end: value.offset + value.length });
  });
  return spans;
}

export function offsetInSpans(offset: number, spans: JsonLdSpan[]): boolean {
  return spans.some(span => offset >= span.start && offset < span.end);
}

export function findSiblingPropertyValue(parent: Node | undefined, text: string, names: Set<string>): Node | undefined {
  if (parent?.type !== 'object') return undefined;
  for (const prop of parent.children ?? []) {
    if (prop?.type !== 'property' || !Array.isArray(prop.children) || prop.children.length < 2) continue;
    const key = propertyKeyName(text, prop);
    if (key && names.has(key)) return prop.children[1];
  }
  return undefined;
}

export function stringArrayValues(text: string, node: Node | undefined): string[] | undefined {
  if (!node) return undefined;
  if (node.type === 'string') {
    const value = jsonStringValue(text, node);
    return value === undefined ? undefined : [value];
  }
  if (node.type === 'array') {
    const values: string[] = [];
    for (const child of node.children ?? []) {
      const value = jsonStringValue(text, child);
      if (value === undefined) return undefined;
      values.push(value);
    }
    return values;
  }
  return undefined;
}

export function hasJsonTypeMapping(
  parent: Node | undefined,
  text: string,
  typeNames: Set<string>,
  ast?: Node,
  resolvedContext?: ResolvedContext,
): boolean {
  if (parent?.type !== 'object') return false;

  for (const prop of parent.children ?? []) {
    if (prop?.type !== 'property' || !Array.isArray(prop.children) || prop.children.length < 2) continue;
    const key = propertyKeyName(text, prop);
    const keyNode = prop.children[0];
    const isType =
      (key !== undefined && typeNames.has(key)) ||
      (ast !== undefined && isJsonLdKeywordAt(ast, text, key, keyNode?.offset ?? 0, '@type', resolvedContext));
    if (!isType) continue;

    const values = stringArrayValues(text, prop.children[1]);
    if (values?.some(value => value === '@json' || value.endsWith('#JSON'))) return true;
  }

  return false;
}
