import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { Node } from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  activeJsonLdContextAt,
  isJsonLdKeywordAt,
  jsonStringValue,
} from '../../jsonld-keyword-utils.js';

export default class IdUsageCheck implements ValidationRule {
  public readonly key = 'idUsage';
  private ast!: Node;
  private text!: string;
  private contextSpan: { start: number; end: number } | null = null;
  private skipSpans: { start: number; end: number }[] = [];
  private resolvedContext?: ResolvedContext;

  init(ctx: { ast: Node; text: string; resolvedContext?: ResolvedContext }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
    this.resolvedContext = ctx.resolvedContext;
    this.contextSpan = null;
    this.skipSpans = [];

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

    walkAst(this.ast, node => {
      if (
        node?.type !== 'property' ||
        this.inSkipSpan(node?.offset) ||
        (this.contextSpan && node?.offset >= this.contextSpan.start && node?.offset < this.contextSpan.end)
      ) {
        return;
      }

      const [keyNode, valNode] = node.children!;
      const term = jsonStringValue(this.text, keyNode);
      if (!term || !this.isIdCoercedProperty(term, keyNode)) return;

      if (!this.isValidIriNode(valNode)) {
        diags.push(
          Diagnostic.create(
            nodeToRange(this.text, valNode),
            `Property "${term}" is defined with @type: @id; this value will expand as a JSON literal instead of an IRI node reference. Use an IRI string or an object with @id.`,
            DiagnosticSeverity.Warning,
            this.key,
            'RDFusion'
          )
        );
      }
    });

    return diags;
  }

  private isIdCoercedProperty(term: string, keyNode: Node): boolean {
    const active = activeJsonLdContextAt(
      this.ast,
      this.text,
      keyNode.offset,
      this.resolvedContext,
    );
    return active.terms.get(term)?.['@type'] === '@id';
  }

  private inSkipSpan(offset: number): boolean {
    return this.skipSpans.some(s => offset >= s.start && offset < s.end);
  }

  private isJsonLdIdKeyword(key: string | undefined, node: Node | undefined): boolean {
    return isJsonLdKeywordAt(
      this.ast,
      this.text,
      key,
      node?.offset ?? 0,
      '@id',
      this.resolvedContext,
    );
  }

  private isValidIriNode(node: Node | undefined): boolean {
    switch (node?.type) {
      case 'string':
        return true;

      case 'object': {
        const props = node.children ?? [];
        if (props.length !== 1) return false;

        const keyNode = props[0].children?.[0];
        const valueNode = props[0].children?.[1];
        const key = jsonStringValue(this.text, keyNode);
        return this.isJsonLdIdKeyword(key, keyNode) && valueNode?.type === 'string';
      }

      case 'array':
        return (node.children ?? []).every(child => this.isValidIriNode(child));

      default:
        return false;
    }
  }
}
