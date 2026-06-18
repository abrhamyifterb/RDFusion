import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }       from '../../../utils';
import { nodeToRange, walkAst } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  collectContextValueSpans,
  isJsonLdKeywordAt,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class NonStringIdCheck implements ValidationRule {
  public readonly key = 'nonStringId';
  private ast!: Node;
  private text!: string;
  private contextSpans: { start: number; end: number }[] = [];
  private resolvedContext?: ResolvedContext;

  init(ctx: { ast: Node; text: string; resolvedContext?: ResolvedContext }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
    this.resolvedContext = ctx.resolvedContext;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        isJsonLdKeywordAt(
          this.ast,
          this.text,
          propertyKeyName(this.text, node),
          node.children[0].offset,
          '@id',
          this.resolvedContext,
        )
      ) {
        const val = node.children[1];
        if (offsetInSpans(node.offset, this.contextSpans)) return;
        if (val?.type !== 'string') {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@id` value must be a string IRI reference, compact IRI, or blank node identifier.',
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
        }
      }
    });
    return diags;
  }
}
