import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }                from '../../../utils';
import { Node }                          from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ReversePropertyCheck implements ValidationRule {
  public readonly key = 'reverseProperty';
  private ast!: Node;
  private text!: string;
  private contextSpan: { start: number; end: number } | null = null;

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const v = node.children[1];
        this.contextSpan = { start: v.offset, end: v.offset + v.length };
      }
    });
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@reverse"'
      ) {
        const val = node.children[1];
        if (
          this.contextSpan &&
          val.offset >= this.contextSpan.start &&
          val.offset < this.contextSpan.end
        ) {return;}

        if (val?.type !== 'object') {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@reverse` value must be an object mapping properties to arrays of node objects.',
            DiagnosticSeverity.Error,
            'RDFusion'
          ));
          return; 
        }

        for (const prop of val.children ?? []) {
          if (
            Array.isArray(prop.children) &&
            prop.children.length >= 2
          ) {
            const keyNode = prop.children[0];
            const mapVal  = prop.children[1];
            const term    = nodeText(this.text, keyNode).slice(1, -1);

            if (mapVal?.type !== 'array') {
              diags.push(Diagnostic.create(
                nodeToRange(this.text, mapVal),
                `\`@reverse\` mapping for "${term}" must be an array of node objects.`,
                DiagnosticSeverity.Error,
                'RDFusion'
              ));
            } else {
              for (const item of mapVal.children ?? []) {
                if (item?.type !== 'object') {
                  diags.push(Diagnostic.create(
                    nodeToRange(this.text, item),
                    `\`@reverse\` mapping for "${term}" contains a non-object; each entry must be a node object.`,
                    DiagnosticSeverity.Error,
                    'RDFusion'
                  ));
                }
              }
            }
          }
        }
      }
    });

    return diags;
  }
}
