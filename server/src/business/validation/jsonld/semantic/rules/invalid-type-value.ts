import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }               from '../../../utils';
import { Node }                         from 'jsonc-parser';
import { walkAst, nodeToRange } from '../../syntax/utils.js';
import {
  collectContextValueSpans,
  keywordNames,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class InvalidTypeValue implements ValidationRule {
  public readonly key = 'invalidTypeValue';
  private ast!: Node;
  private text!: string;
  private contextSpans: { start: number; end: number }[] = [];
  private typeNames = new Set<string>(['@type']);

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
    this.typeNames = keywordNames(this.ast, this.text, '@type');
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        this.typeNames.has(propertyKeyName(this.text, node) ?? '')
      ) {
        const val = node.children[1];
        if (offsetInSpans(node.offset, this.contextSpans)) return;

        const isString = val?.type === 'string';
        const isArrayOfString =
          val?.type === 'array' &&
          (val.children ?? []).every(c => c?.type === 'string');

        if (!isString && !isArrayOfString) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@type` value must be a string or an array of strings.',
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
