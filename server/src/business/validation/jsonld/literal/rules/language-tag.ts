/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { parse as parseBcp47 } from 'bcp-47';
import { Node } from 'jsonc-parser';
import { nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';
import {
  collectContextValueSpans,
  jsonStringValue,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class LanguageTag implements ValidationRule {
  public readonly key = 'languageTagCheck';
  private text!: string; 
  private ast!: Node;
  private contextSpans: { start: number; end: number }[] = [];

  init(ctx: any) { 
    this.text = ctx.text; 
    this.ast = ctx.ast;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        propertyKeyName(this.text, node) === '@language'
      ) {
        const langNode = node.children[1];
        const inContext = offsetInSpans(node.offset, this.contextSpans);
        if (langNode?.type === 'null' && inContext) return;
        if (langNode?.type !== 'string') {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, langNode),
            inContext ? '`@language` in a context must be a string language tag or null.' : 'Language tag must be a string.',
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
          return;
        }
        const tag = jsonStringValue(this.text, langNode) ?? '';
        if (tag && !parseBcp47(tag)?.language) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, langNode),
            `Invalid BCP-47 language tag: "${tag}".`,
            DiagnosticSeverity.Warning,
            this.key,
							'RDFusion'
          ));
        }
      }
    });
    return diags;
  }
}
