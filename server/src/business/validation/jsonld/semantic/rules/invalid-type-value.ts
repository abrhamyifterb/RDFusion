import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }               from '../../../utils';
import { Node }                         from 'jsonc-parser';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import { walkAst, nodeToRange } from '../../syntax/utils.js';
import {
  collectContextValueSpans,
  isJsonLdKeywordAt,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class InvalidTypeValue implements ValidationRule {
  public readonly key = 'invalidTypeValue';
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
          '@type',
          this.resolvedContext,
        )
      ) {
        const val = node.children[1];
        if (offsetInSpans(node.offset, this.contextSpans)) return;

        const isString = val?.type === 'string';
        const isArrayOfString =
          val?.type === 'array' &&
          (val.children ?? []).every(c => c?.type === 'string');
        const isNullInValueObject =
          val?.type === 'null' &&
          (node.parent?.children ?? []).some(sibling =>
            sibling?.type === 'property' &&
            propertyKeyName(this.text, sibling) === '@value'
          );

        if (!isString && !isArrayOfString && !isNullInValueObject) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@type` value must be a string or an array of strings; in value objects it may also be null.',
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
