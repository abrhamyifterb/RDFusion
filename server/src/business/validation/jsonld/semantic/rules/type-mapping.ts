import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export class TypeMappingCheck implements ValidationRule {
  public readonly key = 'typeMapping';
  private ast!: Node;
  private text!: string;

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@type"'
      ) {
        const valNode = node.children[1];
        const check = (n: Node) => {
          if (n?.type !== 'string') {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, n),
              '`@type` mapping must be a string or array of strings.',
              DiagnosticSeverity.Error,
              'RDFusion'
            ));
          }
        };

        if (valNode?.type === 'array') {
          for (const item of valNode.children ?? []) {
            check(item);
          }
        } else {
          check(valNode);
        }
      }
    });
    return diags;
  }
}
