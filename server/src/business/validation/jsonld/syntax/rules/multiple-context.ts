import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { nodeText, nodeToRange } from '../utils.js';

export default class MultipleContext implements ValidationRule {
  public readonly key = 'multipleContext';
  private ast!: Node;
  private text!: string;

  init(ctx: { ast: Node; text: string }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    if (this.ast?.type !== 'object') {return [];}

    let count = 0;
    const diags: Diagnostic[] = [];
    for (const prop of this.ast.children ?? []) {
      if (!Array.isArray(prop.children) || prop.children.length < 1) {continue;}
      const keyNode = prop.children[0];
      if (nodeText(this.text, keyNode) === '"@context"') {
        count++;
        if (count > 1) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, keyNode),
            'Multiple `@context` properties found; only one is allowed at the top level.',
            DiagnosticSeverity.Warning,
            'RDFusion'
          ));
        }
      }
    }
    return diags;
  }
}
