/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Connection,
  TextDocuments,
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node, findNodeAtOffset } from 'jsonc-parser';
import { DataManager } from '../../../../data/data-manager';
import { JsonldParsedGraph } from '../../../../data/irdf-parser';
import { IriExpectationIndex } from './iri-expectation-index';
import { JsonLdEditBuilder } from './jsonld-edit-builder';

export class JsonLdRenameProvider {
  constructor(
    private connection: Connection,
    private dataManager: DataManager,
    private documents: TextDocuments<TextDocument>,
  ) {}

  public prepareRename = (params: { textDocument: { uri: string }; position: Position }) => {
    const doc = this.documents.get(params.textDocument.uri);
    if (!doc) return null;

    const parsed = this.dataManager.getParsedData(params.textDocument.uri) as JsonldParsedGraph | undefined;
    if (!parsed) return null;
    const { text, ast } = parsed;

    const offset = doc.offsetAt(params.position);
    const node = findNodeAtOffset(ast, offset);
    if (!node || node.type !== 'string') return null;

    const index = new IriExpectationIndex();
    index.init({ text, ast });

    const isKey = node.parent?.type === 'property' && node.parent.children?.[0] === node;
    const isValue = index.isIriValueStringNode(node);
    if (!isKey && !isValue) return null;
    if (isKey && !index.keyIsIriExpected(node)) return null;

    let s: string;
    try { s = JSON.parse(text.slice(node.offset, node.offset + node.length)); }
    catch { return null; }

    const colon = s.indexOf(':');
    const hasPrefix = colon > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.slice(0, colon));
    if (hasPrefix) {
      const pref = s.slice(0, colon);
      const startOff = node.offset + 1;
      const endOff = startOff + pref.length;
      return { range: Range.create(doc.positionAt(startOff), doc.positionAt(endOff)), placeholder: pref };
    }

    const sep = Math.max(s.lastIndexOf('#'), s.lastIndexOf('/'));
    if (sep < 0) return null;
    const startOff = node.offset + 1;
    const endOff = startOff + (sep + 1);
    return { range: Range.create(doc.positionAt(startOff), doc.positionAt(endOff)), placeholder: 'ex' };
  };

  public rename = (params: {
    textDocument: { uri: string };
    position: Position;
    newName: string;
  }) => {
    const uri = params.textDocument.uri;
    const parsed = this.dataManager.getParsedData(uri) as JsonldParsedGraph | undefined;
    if (!parsed) return null;

    const { text, ast, contextMap } = parsed;
    const doc = this.documents.get(uri)!;

    const offset = doc.offsetAt(params.position);
    const node = findNodeAtOffset(ast, offset) as Node | undefined;
    if (!node || node.type !== 'string') return null;

    const index = new IriExpectationIndex();
    index.init({ text, ast });

    const isKey = node.parent?.type === 'property' && node.parent.children?.[0] === node;
    const isValue = index.isIriValueStringNode(node);
    if (!isKey && !isValue) return null;
    if (isKey && !index.keyIsIriExpected(node)) return null;

    let s: string;
    try { s = JSON.parse(text.slice(node.offset, node.offset + node.length)); } catch { return null; }

    const newPref = params.newName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newPref)) {
      this.connection.window.showErrorMessage(`Invalid prefix: ${newPref}`);
      return null;
    }

    const edits: TextEdit[] = [];
    const builder = new JsonLdEditBuilder(doc, text, ast);

    const colon = s.indexOf(':');
    const hasPrefix = colon > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.slice(0, colon));
    if (hasPrefix) {
      const oldPref = s.slice(0, colon);
      if (oldPref === newPref) return { changes: {} };

      const oldNs = contextMap.get(oldPref);
      if (!oldNs) return null;

      const conflictNs = contextMap.get(newPref);
      if (conflictNs && conflictNs !== oldNs) {
        this.connection.window.showWarningMessage(
          `Cannot rename: prefix "${newPref}" is already bound to "${conflictNs}".`
        );
        return null;
      }

      builder.renameCompactPrefixEverywhere(oldPref, newPref, index, edits);

      const merged: Record<string, string> = {};
      for (const [p, n] of contextMap.entries()) if (p !== oldPref) {merged[p] = n;}
      merged[newPref] = oldNs;

      let ctxValue: any | undefined;
      if (ast.type === 'object') {
        for (const prop of ast.children ?? []) {
          if (prop.type !== 'property' || prop.children?.length !== 2) continue;
          const k = prop.children[0];
          if (JSON.parse(text.slice(k.offset, k.offset + k.length)) === '@context') {
            ctxValue = prop.children[1]; break;
          }
        }
      }
      if (ctxValue) {
        edits.push(
          TextEdit.replace(
            Range.create(doc.positionAt(ctxValue.offset), doc.positionAt(ctxValue.offset + ctxValue.length)),
            JSON.stringify(merged, null, 2)
          )
        );
      }

      contextMap.delete(oldPref);
      contextMap.set(newPref, oldNs);

      return { changes: { [uri]: edits } };
    }

    const sep = Math.max(s.lastIndexOf('#'), s.lastIndexOf('/'));
    if (sep < 0) return null;
    const oldNs = s.slice(0, sep + 1);

    const existing = contextMap.get(newPref);
    if (existing && existing !== oldNs) {
      this.connection.window.showWarningMessage(
        `Cannot rename: prefix "${newPref}" is already bound to "${existing}".`
      );
      return null;
    }

    builder.replaceNamespaceInEligiblePositions(oldNs, newPref, index, edits);
    builder.ensurePrefixMapping(newPref, oldNs, contextMap, edits);

    return { changes: { [uri]: edits } };
  };
}
