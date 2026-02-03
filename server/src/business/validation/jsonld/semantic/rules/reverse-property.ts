import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { Node } from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ReversePropertyCheck implements ValidationRule {
  public readonly key = 'reverseProperty';
  private ast!: Node;
  private text!: string;

  private contextSpans: { start: number; end: number }[] = [];

  init(ctx: { ast: Node; text: string }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
    this.contextSpans = [];

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const v = node.children[1];
        if (v) {this.contextSpans.push({ start: v.offset, end: v.offset + v.length });}
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
        if (!val) {return;}

        const inContext = this.isInsideAnyContext(node.offset);

        if (inContext) {
          // JSON-LD: @reverse in an expanded term definition MUST be an IRI/compact IRI (string)
          if (val.type !== 'string') {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, val),
              '`@reverse` inside @context (term definition) must be a string IRI/compact IRI (or blank node id).',
              DiagnosticSeverity.Error,
              'RDFusion'
            ));
          }
          return;
        }

        if (val.type !== 'object') {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@reverse` outside @context must be an object (reverse property map).',
            DiagnosticSeverity.Error,
            'RDFusion'
          ));
          return;
        }

        for (const prop of val.children ?? []) {
          if (!Array.isArray(prop.children) || prop.children.length < 2) {continue;}

          const keyNode = prop.children[0];
          const mapVal  = prop.children[1];
          const term    = nodeText(this.text, keyNode).slice(1, -1);

          if (!this.isReverseValue(mapVal)) {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, mapVal),
              `\`@reverse\` value for "${term}" must be a string IRI/compact IRI/blank node id, a node object, or an array of those.`,
              DiagnosticSeverity.Error,
              'RDFusion'
            ));
          }
        }
      }
    });

    return diags;
  }

  private isInsideAnyContext(offset: number): boolean {
    return this.contextSpans.some(s => offset >= s.start && offset < s.end);
  }

  private isReverseValue(n: Node | undefined): boolean {
    if (!n) {return false;}

    if (n.type === 'string') {return true;}

    if (n.type === 'object') {
      const keys = (n.children ?? [])
        .filter(p => p?.type === 'property' && Array.isArray(p.children) && p.children[0])
        .map(p => nodeText(this.text, p.children![0]));
      if (keys.includes('"@value"') || keys.includes('"@list"') || keys.includes('"@set"')) {return false;}
      return true;
    }

    if (n.type === 'array') {
      return (n.children ?? []).every(it => it?.type !== 'array' && this.isReverseValue(it));
    }

    return false;
  }
}
