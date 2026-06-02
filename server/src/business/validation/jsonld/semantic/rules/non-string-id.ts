import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }       from '../../../utils';
import { nodeToRange, walkAst } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';
import {
  collectContextValueSpans,
  keywordNames,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class NonStringIdCheck implements ValidationRule {
  public readonly key = 'nonStringId';
  private ast!: Node;
  private text!: string;
  private contextSpans: { start: number; end: number }[] = [];
  private idNames = new Set<string>(['@id']);

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
    this.idNames = keywordNames(this.ast, this.text, '@id');
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        this.idNames.has(propertyKeyName(this.text, node) ?? '')
      ) {
        const val = node.children[1];
        if (offsetInSpans(node.offset, this.contextSpans)) return;
        if (val?.type !== 'string') {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@id` value must be a JSON string IRI.',
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
