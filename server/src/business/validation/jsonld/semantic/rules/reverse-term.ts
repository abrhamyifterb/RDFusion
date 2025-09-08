import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }                from '../../../utils';
import { Node }                          from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ReverseTermCheck implements ValidationRule {
  public readonly key = 'reverseTermType';
  private ast!: Node;
  private text!: string;
  private contextSpan: { start: number; end: number } | null = null;

  private idTerms = new Set<string>();

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const v = node.children[1];
        this.contextSpan = { start: v.offset, end: v.offset + v.length };
      }
    });

    if (this.contextSpan) {
      walkAst(this.ast, node => {
        if (
          node?.type === 'property' && this.contextSpan &&
          node?.offset >= this.contextSpan.start &&
          node?.offset < this.contextSpan.end &&
          Array.isArray(node.children) &&
          node.children.length >= 2
        ) {
          const [ keyNode, valNode ] = node.children;
          const term = nodeText(this.text, keyNode).slice(1, -1);

          if (valNode?.type === 'object') {
            for (const inner of valNode.children ?? []) {
              if (!inner?.children || inner.children.length < 2) { continue; }
              const k = nodeText(this.text, inner.children[0]);
              const v = inner.children[1];

              if (k === '"@type"') {
                if (v?.type === 'string') {
                  if (JSON.parse(nodeText(this.text, v)) === '@id') {
                    this.idTerms.add(term);
                  }
                } else if (v?.type === 'array') {
                  for (const itm of v.children ?? []) {
                    if (
                      itm?.type === 'string' &&
                      JSON.parse(nodeText(this.text, itm)) === '@id'
                    ) {
                      this.idTerms.add(term);
                    }
                  }
                }
              }
            }
          }
        }
      });
    }
  }

  private isIriKey(key: string): boolean {
    return /^(https?:|urn:|mailto:|did:)/.test(key);
  }

  private valueContainsString(valNode: Node | undefined): boolean {
    if (!valNode) { return false; }
    if (valNode.type === 'string') { return true; }
    if (valNode.type === 'array') {
      for (const itm of valNode.children ?? []) {
        if (itm?.type === 'string') { return true; }
      }
    }
    return false; 
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@reverse"'
      ) {
        const val = node.children[1];

        if (
          this.contextSpan &&
          val.offset >= this.contextSpan.start &&
          val.offset < this.contextSpan.end
        ) { return; }

        if (val?.type !== 'object') { return; }

        for (const prop of val.children ?? []) {
          if (!prop?.children || prop.children.length < 2) { continue; }

          const keyNode  = prop.children[0];
          const valueNode = prop.children[1];
          const termOrIri = nodeText(this.text, keyNode).slice(1, -1);

          if (this.isIriKey(termOrIri)) { continue; }

          if (this.idTerms.has(termOrIri)) { continue; }

          if (this.valueContainsString(valueNode)) {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, keyNode),
              `Property "${termOrIri}" is used in \`@reverse\` with a string value, but its context mapping does not set \`@type\` to \`"@id"\`. `,
              DiagnosticSeverity.Error,
              'RDFusion'
            ));
          }
        }
      }
    });

    return diags;
  }
}
