import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { Node } from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class IdUsageCheck implements ValidationRule {
  public readonly key = 'idUsage';
  private ast!: Node;
  private text!: string;
  private contextSpan: { start: number; end: number } | null = null;
  private skipSpans: { start: number; end: number }[] = [];

  init(ctx: { ast: Node; text: string }) {
    this.ast = ctx.ast;
    this.text = ctx.text;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        nodeText(this.text, node.children![0]) === '"@context"'
      ) {
        const val = node.children![1];
        this.contextSpan = { start: val.offset, end: val.offset + val.length };
      }
    });

    const skipKeywords = ['"@reverse"', '"@context"'];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        skipKeywords.includes(nodeText(this.text, node.children![0]))
      ) {
        const val = node.children![1];
        this.skipSpans.push({ start: val.offset, end: val.offset + val.length });
      }
    });
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    const idTerms = this.collectIdTerms();

    walkAst(this.ast, node => {
      if (
        node?.type !== 'property' ||
        this.inSkipSpan(node?.offset) ||
        (this.contextSpan && node?.offset >= this.contextSpan.start && node?.offset < this.contextSpan.end)
      ) {
        return;
      }

      const [keyNode, valNode] = node.children!;
      const term = nodeText(this.text, keyNode).slice(1, -1);
      if (!idTerms.has(term)) {return;}

      if (!IdUsageCheck.isValidIriNode(valNode, this.text)) {
        diags.push(
          Diagnostic.create(
            nodeToRange(this.text, valNode),
            // eslint-disable-next-line no-useless-escape
            `Property "${term}" is coerced with @type:@id; its value must be an IRI string, an object {"@id": "<IRI>"}, or an array of those.`,
            DiagnosticSeverity.Error,
            'RDFusion'
          )
        );
      }
    });

    return diags;
  }

  private collectIdTerms(): Set<string> {
    const idTerms = new Set<string>();
    if (!this.contextSpan) {return idTerms;}

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        node?.offset >= this.contextSpan!.start &&
        node?.offset < this.contextSpan!.end
      ) {
        const [keyNode, valNode] = node.children!;
        const term = nodeText(this.text, keyNode).slice(1, -1);
        if (valNode?.type === 'object') {
          for (const inner of valNode.children ?? []) {
            const innerKey = nodeText(this.text, inner.children![0]);
            const typeNode = inner.children![1];
            if (
              innerKey === '"@type"' &&
              ((typeNode?.type === 'string' && JSON.parse(nodeText(this.text, typeNode)) === '@id') ||
                (typeNode?.type === 'array' && typeNode.children!.some(
                  child => child?.type === 'string' && JSON.parse(nodeText(this.text, child)) === '@id'
                )))
            ) {
              idTerms.add(term);
            }
          }
        }
      }
    });

    return idTerms;
  }

  private inSkipSpan(offset: number): boolean {
    return this.skipSpans.some(s => offset >= s.start && offset < s.end);
  }

  private static isValidIriNode(node: Node, text: string): boolean {
    switch (node?.type) {
      case 'string':
        return true;

      case 'object': {
        const props = node.children ?? [];
        return (
          props.length === 1 &&
          nodeText(text, props[0].children![0]) === '"@id"' &&
          props[0].children![1]?.type === 'string'
        );
      }

      case 'array':
        return node.children!.every(child => IdUsageCheck.isValidIriNode(child, text));

      default:
        return false;
    }
  }
}
