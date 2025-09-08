/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node } from 'jsonc-parser';
import { Range, TextEdit } from 'vscode-languageserver/node';
import { IriExpectationIndex } from './iri-expectation-index';

export class JsonLdEditBuilder {
  constructor(
    private doc: TextDocument,
    private text: string,
    private ast: Node
  ) {}

  ensurePrefixMapping(prefix: string, ns: string, currentContext: Map<string, string>, edits: TextEdit[]) {
    const merged: Record<string, string> = {};
    for (const [p, n] of currentContext.entries()) {merged[p] = n;}
    merged[prefix] = ns;

    const newCtxText = JSON.stringify(merged, null, 2);

    let ctxValueNode: Node | undefined;
    if (this.ast.type === 'object') {
      for (const prop of this.ast.children ?? []) {
        if (
          prop.type === 'property' &&
          prop.children?.[0]?.type === 'string' &&
          JSON.parse(this.text.slice(prop.children[0].offset, prop.children[0].offset + prop.children[0].length)) === '@context'
        ) {
          ctxValueNode = prop.children[1];
          break;
        }
      }
    }

    if (ctxValueNode) {
      edits.push(
        TextEdit.replace(
          Range.create(
            this.doc.positionAt(ctxValueNode.offset),
            this.doc.positionAt(ctxValueNode.offset + ctxValueNode.length)
          ),
          newCtxText
        )
      );
    } else if (this.ast.type === 'object') {
      const insertPos = this.doc.positionAt(this.ast.offset + 1);
      const lineStart = this.text.lastIndexOf('\n', this.ast.offset) + 1;
      const indent = (this.text.slice(lineStart, this.ast.offset).match(/^\s*/) || [''])[0];
      edits.push(TextEdit.insert(insertPos, `\n${indent}"@context": ${newCtxText},`));
    } else if (this.ast.type === 'array') {
      let arr: any; try { arr = JSON.parse(this.text); } catch { arr = []; }
      const wrap = { '@context': merged, '@graph': arr };
      edits.push(TextEdit.replace(
        Range.create({ line: 0, character: 0 }, this.doc.positionAt(this.text.length)),
        JSON.stringify(wrap, null, 2)
      ));
    }
  }

  /** Replace eligible KEYS/VALUES starting with `ns` to `prefix:`. */
  replaceNamespaceInEligiblePositions(ns: string, prefix: string, index: IriExpectationIndex, edits: TextEdit[]) {

    this.forEachProperty((keyNode, keyStr) => {
      if (!keyStr || !index.keyIsIriExpected(keyNode)) return;
      if (!keyStr.startsWith(ns)) return;
      const from = keyNode.offset + 1;
      const to = from + ns.length;
      edits.push(TextEdit.replace(
        Range.create(this.doc.positionAt(from), this.doc.positionAt(to)),
        `${prefix}:`
      ));
    });

    this.forEachString((strNode, value) => {
      if (!index.isIriValueStringNode(strNode)) return;
      if (!value.startsWith(ns)) return;
      const from = strNode.offset + 1;
      const to = from + ns.length;
      edits.push(TextEdit.replace(
        Range.create(this.doc.positionAt(from), this.doc.positionAt(to)),
        `${prefix}:`
      ));
    });
  }

  renameCompactPrefixEverywhere(oldPref: string, newPref: string, index: IriExpectationIndex, edits: TextEdit[]) {
    const oldPrefixColon = `${oldPref}:`;

    this.forEachProperty((keyNode, keyStr) => {
      if (!keyStr || !index.keyIsIriExpected(keyNode)) return;
      if (!keyStr.startsWith(oldPrefixColon)) return;
      const from = keyNode.offset + 1;
      const to = from + oldPrefixColon.length;
      edits.push(TextEdit.replace(
        Range.create(this.doc.positionAt(from), this.doc.positionAt(to)),
        `${newPref}:`
      ));
    });

    this.forEachString((strNode, value) => {
      if (!index.isIriValueStringNode(strNode)) return;
      if (!value.startsWith(oldPrefixColon)) return;
      const from = strNode.offset + 1;
      const to = from + oldPrefixColon.length;
      edits.push(TextEdit.replace(
        Range.create(this.doc.positionAt(from), this.doc.positionAt(to)),
        `${newPref}:`
      ));
    });
  }

  private forEachProperty(cb: (keyNode: Node, keyStr: string | null) => void) {
    const visit = (n: Node) => {
      if (n.type === 'object') {
        for (const p of n.children ?? []) {
          if (p.type !== 'property' || p.children?.length !== 2) continue;
          const keyNode = p.children[0];
          let keyStr: string | null = null;
          try { 
            keyStr = JSON.parse(this.text.slice(keyNode.offset, keyNode.offset + keyNode.length)); 
          } catch { /**/ }
          cb(keyNode, keyStr);
          visit(p.children[1]);
        }
      } else if (n.type === 'array') {
        for (const c of n.children ?? []) visit(c);
      }
    };
    visit(this.ast);
  }

  private forEachString(cb: (strNode: Node, value: string) => void) {
    const visit = (n: Node) => {
      if (n.type === 'string') {
        try { 
          cb(n, JSON.parse(this.text.slice(n.offset, n.offset + n.length))); 
        } catch {
          //
        }
      }
      n.children?.forEach(visit);
    };
    visit(this.ast);
  }
}
