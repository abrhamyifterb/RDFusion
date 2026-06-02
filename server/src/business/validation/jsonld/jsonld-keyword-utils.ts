import type { Node } from 'jsonc-parser';
import { findJsonLdKeywordAliases } from '../../../utils/shared/jsonld/context-prefix.js';
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

export function hasJsonTypeMapping(parent: Node | undefined, text: string, typeNames: Set<string>): boolean {
  const typeNode = findSiblingPropertyValue(parent, text, typeNames);
  const values = stringArrayValues(text, typeNode);
  return !!values?.some(value => value === '@json' || value.endsWith('#JSON'));
}
