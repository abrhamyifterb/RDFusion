import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  collectContextValueSpans,
  jsonStringValue,
  isJsonLdKeywordAt,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

export default class RelativeIriCheck implements ValidationRule {
  public readonly key = 'relativeIri';
  private ast!: Node;
  private text!: string;

  private contextSpans: { start: number; end: number }[] = [];
  private baseValue: string | null | undefined;
  private resolvedContext?: ResolvedContext;

  init(ctx: { ast: Node; text: string; resolvedContext?: ResolvedContext }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
    this.resolvedContext = ctx.resolvedContext;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
    this.baseValue = undefined;

    let firstContextNode: Node | null = null;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        propertyKeyName(this.text, node) === '@context'
      ) {
        const val = node.children[1];
        if (!val) return;
        if (!firstContextNode || val.offset < firstContextNode.offset) {
          firstContextNode = val;
        }
      }
    });

    if (firstContextNode) {
      this.baseValue = this.extractBase(firstContextNode);
    }
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
        if (!val || val.type !== 'string') return;
        if (offsetInSpans(val.offset, this.contextSpans)) return;

        const str = jsonStringValue(this.text, val);
        if (!str || this.isNonRelativeId(str)) return;

        if (this.baseValue === undefined || this.baseValue === null) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            `Relative @id value "${str}" has no explicit @base in this document. Add @base or use an absolute IRI if the relative IRI is not intended.`,
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
        }
      }
    });

    return diags;
  }

  private isNonRelativeId(str: string): boolean {
    if (str.startsWith('_:')) return true;

    const colon = str.indexOf(':');
    if (colon === -1) return false;

    const m = /[/?#]/.exec(str);
    const firstDelim = m ? m.index : Number.POSITIVE_INFINITY;

    return colon < firstDelim;
  }

  private extractBase(ctxNode: Node): string | null | undefined {
    if (!ctxNode) return undefined;
    if (ctxNode.type === 'null') return null;

    if (ctxNode.type === 'array' && Array.isArray(ctxNode.children)) {
      let base: string | null | undefined = undefined;
      for (const child of ctxNode.children) {
        const b = this.extractBase(child);
        if (b !== undefined) base = b;
      }
      return base;
    }

    if (ctxNode.type === 'object' && Array.isArray(ctxNode.children)) {
      for (const prop of ctxNode.children) {
        if (prop?.type !== 'property' || !Array.isArray(prop.children) || prop.children.length < 2) continue;
        const [keyNode, valNode] = prop.children;
        if (nodeText(this.text, keyNode) === '"@base"') {
          if (valNode?.type === 'string') return JSON.parse(nodeText(this.text, valNode));
          if (valNode?.type === 'null') return null;
        }
      }
    }

    return undefined;
  }
}
