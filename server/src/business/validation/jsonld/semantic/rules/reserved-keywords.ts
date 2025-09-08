import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ReservedKeywordRedefinition implements ValidationRule {
  public readonly key = 'reservedKeywordRedefinition';
  private ast!: Node;
  private text!: string;
  private reserved = new Set([
    '@context','@id','@type','@value','@language', '@container',
    '@list','@set','@reverse','@graph','@index', '@included', 
    '@version', '@propagate', '@protected', '@import', '@none'
  ]);

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const ctxNode = node.children[1];
        if (ctxNode?.type === 'object') {
          for (const termProp of ctxNode.children ?? []) {
            if (
              Array.isArray(termProp.children) &&
              termProp.children.length >= 1
            ) {
              const keyNode = termProp.children[0];
              const term = nodeText(this.text, keyNode).slice(1,-1);
              if (this.reserved.has(term)) {
                diags.push(Diagnostic.create(
                  nodeToRange(this.text, keyNode),
                  `Term "${term}" in "@context" must not redefine a JSON-LD keyword.`,
                  DiagnosticSeverity.Error,
                  'RDFusion'
                ));
              }
            }
          }
        }
      }
    });
    return diags;
  }
}
