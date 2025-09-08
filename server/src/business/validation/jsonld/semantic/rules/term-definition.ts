import { Node } from 'jsonc-parser';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils.js';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export class TermDefinitionTypeCheck implements ValidationRule {
  public readonly key = 'termDefinitionType';
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
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const ctxNode = node.children[1];
        if (ctxNode?.type === 'object') {
          for (const termProp of ctxNode.children ?? []) {
            if (
              Array.isArray(termProp.children) &&
              termProp.children.length >= 2
            ) {
              const valNode = termProp.children[1];
              if (!['string','object','array'].includes(valNode?.type)) {
                diags.push(Diagnostic.create(
                  nodeToRange(this.text, valNode),
                  `Value for term must be a string, object, or array, not ${valNode?.type}.`,
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
