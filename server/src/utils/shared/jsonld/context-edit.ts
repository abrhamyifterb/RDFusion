import { findNodeAtOffset, Node } from 'jsonc-parser';
import {
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

export type JsonLdContextEditScope = 'nearest' | 'root';

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function nodeJsonValue<T = unknown>(text: string, node: Node): T | undefined {
  try {
    return JSON.parse(text.slice(node.offset, node.offset + node.length)) as T;
  } catch {
    return undefined;
  }
}

function findObjectProperty(text: string, objectNode: Node, name: string): Node | undefined {
  if (objectNode.type !== 'object') return undefined;
  for (const child of objectNode.children ?? []) {
    if (child.type !== 'property' || child.children?.length !== 2) continue;
    const key = child.children[0];
    if (key?.type !== 'string') continue;
    if (nodeJsonValue<string>(text, key) === name) return child;
  }
  return undefined;
}

function indentForNode(text: string, node: Node): string {
  const lineStart = text.lastIndexOf('\n', node.offset) + 1;
  return text.slice(lineStart, node.offset).match(/^\s*/)?.[0] ?? '';
}

function parentObject(node: Node | undefined): Node | undefined {
  let current = node?.parent;
  while (current) {
    if (current.type === 'object') return current;
    current = current.parent;
  }
  return undefined;
}

function isContextValue(text: string, node: Node): boolean {
  const parent = node.parent;
  if (parent?.type !== 'property' || parent.children?.[1] !== node) return false;
  const key = parent.children?.[0];
  return !!key && key.type === 'string' && nodeJsonValue<string>(text, key) === '@context';
}

function containingDataObject(text: string, ast: Node, offset: number): Node | undefined {
  let node: Node | undefined = findNodeAtOffset(ast, offset, true);
  while (node && node.type !== 'object') node = node.parent;

  while (node && isContextValue(text, node)) {
    node = parentObject(node.parent);
  }

  return node;
}

function contextValueOnObject(text: string, objectNode: Node): Node | undefined {
  return findObjectProperty(text, objectNode, '@context')?.children?.[1];
}

export function findJsonLdContextNodeAt(
  ast: Node,
  text: string,
  offset: number,
  scope: JsonLdContextEditScope = 'nearest',
): Node | undefined {
  if (scope === 'root') {
    if (ast.type === 'object') return contextValueOnObject(text, ast);
    return undefined;
  }

  let objectNode = containingDataObject(text, ast, offset);
  while (objectNode) {
    const ctx = contextValueOnObject(text, objectNode);
    if (ctx) return ctx;
    objectNode = parentObject(objectNode);
  }

  return ast.type === 'object' ? contextValueOnObject(text, ast) : undefined;
}

export function collectJsonLdContextPrefixes(text: string, ctxNode: Node | undefined): Set<string> {
  const used = new Set<string>();
  if (!ctxNode) return used;

  const collectFromObject = (objectNode: Node) => {
    for (const prop of objectNode.children ?? []) {
      if (prop?.type !== 'property' || !prop.children) continue;
      const key = prop.children[0];
      if (key?.type !== 'string') continue;
      const value = nodeJsonValue<string>(text, key);
      if (value) used.add(value);
    }
  };

  if (ctxNode.type === 'object') {
    collectFromObject(ctxNode);
  } else if (ctxNode.type === 'array') {
    for (const child of ctxNode.children ?? []) {
      if (child?.type === 'object') collectFromObject(child);
    }
  }

  return used;
}

export function collectJsonLdContextPrefixesAt(ast: Node, text: string, offset: number): Set<string> {
  const used = new Set<string>();
  let objectNode = containingDataObject(text, ast, offset);

  while (objectNode) {
    for (const prefix of collectJsonLdContextPrefixes(text, contextValueOnObject(text, objectNode))) {
      used.add(prefix);
    }
    objectNode = parentObject(objectNode);
  }

  return used;
}

function objectHasProperty(text: string, objectNode: Node, name: string): boolean {
  return !!findObjectProperty(text, objectNode, name);
}

function contextHasPrefix(text: string, ctxNode: Node | undefined, prefix: string): boolean {
  if (!ctxNode) return false;
  if (ctxNode.type === 'object') return objectHasProperty(text, ctxNode, prefix);
  if (ctxNode.type === 'array') {
    return (ctxNode.children ?? []).some((child: Node | undefined) => child?.type === 'object' && objectHasProperty(text, child, prefix));
  }
  return false;
}

function hasTrailingCommaBeforeClose(text: string, node: Node): boolean {
  const children = node.children ?? [];
  if (children.length === 0) return false;
  const lastChild = children[children.length - 1];
  const closeOffset = node.offset + node.length - 1;
  const betweenLastChildAndClose = text.slice(lastChild.offset + lastChild.length, closeOffset);
  return betweenLastChildAndClose.includes(',');
}

function insertIntoObjectContext(doc: TextDocument, text: string, ctxNode: Node, prefix: string, iri: string): TextEdit[] {
  if (contextHasPrefix(text, ctxNode, prefix)) return [];

  const contextIndent = indentForNode(text, ctxNode);
  const mappingIndent = `${contextIndent}  `;
  const hasChildren = (ctxNode.children?.length ?? 0) > 0;
  const insertOffset = ctxNode.offset + ctxNode.length - 1;
  const separator = hasTrailingCommaBeforeClose(text, ctxNode) ? '' : ',';
  const insertText = hasChildren
    ? `${separator}\n${mappingIndent}${jsonString(prefix)}: ${jsonString(iri)}`
    : `\n${mappingIndent}${jsonString(prefix)}: ${jsonString(iri)}\n${contextIndent}`;
  return [TextEdit.insert(doc.positionAt(insertOffset), insertText)];
}

function appendContextObjectToArray(doc: TextDocument, text: string, ctxNode: Node, prefix: string, iri: string): TextEdit[] {
  if (contextHasPrefix(text, ctxNode, prefix)) return [];

  const contextIndent = indentForNode(text, ctxNode);
  const entryIndent = `${contextIndent}  `;
  const objectIndent = `${entryIndent}  `;
  const hasChildren = (ctxNode.children?.length ?? 0) > 0;
  const insertOffset = ctxNode.offset + ctxNode.length - 1;
  const entry = `{\n${objectIndent}${jsonString(prefix)}: ${jsonString(iri)}\n${entryIndent}}`;
  const separator = hasTrailingCommaBeforeClose(text, ctxNode) ? '' : ',';
  const insertText = hasChildren
    ? `${separator}\n${entryIndent}${entry}`
    : `\n${entryIndent}${entry}\n${contextIndent}`;
  return [TextEdit.insert(doc.positionAt(insertOffset), insertText)];
}

function replaceContextWithArray(doc: TextDocument, text: string, ctxNode: Node, prefix: string, iri: string): TextEdit[] {
  const rawContext = text.slice(ctxNode.offset, ctxNode.offset + ctxNode.length);
  const contextIndent = indentForNode(text, ctxNode);
  const entryIndent = `${contextIndent}  `;
  const objectIndent = `${entryIndent}  `;
  const replacement = `[\n${entryIndent}${rawContext},\n${entryIndent}{\n${objectIndent}${jsonString(prefix)}: ${jsonString(iri)}\n${entryIndent}}\n${contextIndent}]`;
  return [
    TextEdit.replace(
      Range.create(doc.positionAt(ctxNode.offset), doc.positionAt(ctxNode.offset + ctxNode.length)),
      replacement,
    ),
  ];
}

function insertContextIntoObject(doc: TextDocument, text: string, objectNode: Node, prefix: string, iri: string): TextEdit[] {
  const objectIndent = indentForNode(text, objectNode);
  const childIndent = `${objectIndent}  `;
  const grandChildIndent = `${childIndent}  `;
  const hasExistingProperties = (objectNode.children?.length ?? 0) > 0;
  const insertText = `\n${childIndent}"@context": {\n${grandChildIndent}${jsonString(prefix)}: ${jsonString(iri)}\n${childIndent}}${hasExistingProperties ? ',' : ''}`;
  return [TextEdit.insert(doc.positionAt(objectNode.offset + 1), insertText)];
}

function wrapRootArray(doc: TextDocument, text: string, ast: Node, prefix: string, iri: string): TextEdit[] {
  const rootIndent = indentForNode(text, ast);
  const childIndent = `${rootIndent}  `;
  const grandChildIndent = `${childIndent}  `;
  const replacement = `{\n${childIndent}"@context": {\n${grandChildIndent}${jsonString(prefix)}: ${jsonString(iri)}\n${childIndent}},\n${childIndent}"@graph": ${text.replace(/\n/g, `\n${childIndent}`)}\n${rootIndent}}`;
  return [TextEdit.replace(Range.create(Position.create(0, 0), doc.positionAt(text.length)), replacement)];
}

function nearestObjectWithContext(text: string, objectNode: Node | undefined): Node | undefined {
  let current = objectNode;
  while (current) {
    if (contextValueOnObject(text, current)) return current;
    current = parentObject(current);
  }
  return undefined;
}

export function buildJsonLdPrefixContextEdits(
  doc: TextDocument,
  ast: Node,
  prefix: string,
  iri: string,
  offset: number,
  scope: JsonLdContextEditScope = 'nearest',
): TextEdit[] {
  const text = doc.getText();

  if (scope === 'root' && ast.type === 'array') {
    return wrapRootArray(doc, text, ast, prefix, iri);
  }

  const containingObject = scope === 'root'
    ? (ast.type === 'object' ? ast : undefined)
    : containingDataObject(text, ast, offset);

  if (!containingObject) return [];

  const targetObject = scope === 'root'
    ? containingObject
    : nearestObjectWithContext(text, containingObject) ?? containingObject;

  const existingContext = contextValueOnObject(text, targetObject);
  if (!existingContext) {
    return insertContextIntoObject(doc, text, targetObject, prefix, iri);
  }

  if (existingContext.type === 'object') {
    return insertIntoObjectContext(doc, text, existingContext, prefix, iri);
  }

  if (existingContext.type === 'array') {
    return appendContextObjectToArray(doc, text, existingContext, prefix, iri);
  }

  return replaceContextWithArray(doc, text, existingContext, prefix, iri);
}
