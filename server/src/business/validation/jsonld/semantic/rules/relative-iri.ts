import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }       from '../../../utils';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';

export default class RelativeIriCheck implements ValidationRule {
  public readonly key = 'relativeIri';
  private ast!: Node;
  private text!: string;
  private contextSpan: { start: number; end: number } | null = null;
  private baseValue: string | null | undefined;

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const val = node.children[1];
        this.contextSpan = { start: val.offset, end: val.offset + val.length };
      }
    });

    if (this.contextSpan) {
      walkAst(this.ast, node => {
        if (
          node?.type === 'property' &&
          node?.offset >= this.contextSpan!.start &&
          node?.offset <  this.contextSpan!.end &&
          Array.isArray(node.children) && node.children.length >= 2
        ) {
          const [ keyNode, valNode ] = node.children;
          if (nodeText(this.text, keyNode) === '"@base"') {
            if (valNode?.type === 'string') {
              this.baseValue = JSON.parse(nodeText(this.text, valNode));
            } else if (valNode?.type === 'null') {
              this.baseValue = null;
            }
          }
        }
      });
    }
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    const absoluteIri = /^[A-Za-z][A-Za-z0-9+.-]*:/;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@id"'
      ) {
        const val = node.children[1];
        if (
          this.contextSpan &&
          val.offset >= this.contextSpan.start &&
          val.offset < this.contextSpan.end
        ) {
          return;
        }
        if (val?.type === 'string') {
          const str = JSON.parse(nodeText(this.text, val));
          if (!absoluteIri.test(str)) {
            if (this.baseValue === undefined || this.baseValue === null) {
              diags.push(Diagnostic.create(
                nodeToRange(this.text, val),
                `Relative IRI "${str}" used but no @base defined to resolve it.`,
                DiagnosticSeverity.Error,
                'RDFusion'
              ));
            }
          }
        }
      }
    });

    return diags;
  }
}
