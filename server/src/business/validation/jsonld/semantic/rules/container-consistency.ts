import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { Node } from 'jsonc-parser';
import { walkAst, nodeToRange } from '../../syntax/utils.js';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  activeJsonLdContextAt,
  collectContextValueSpans,
  jsonStringValue,
  offsetInSpans,
} from '../../jsonld-keyword-utils.js';

export default class ContainerUsageCheck implements ValidationRule {
  public readonly key = 'containerUsage';
  private ast!: Node;
  private text!: string;
  private resolvedContext?: ResolvedContext;
  private contextSpans: { start: number; end: number }[] = [];

  init(ctx: { ast: Node; text: string; resolvedContext?: ResolvedContext }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
    this.resolvedContext = ctx.resolvedContext;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];

    walkAst(this.ast, node => {
      if (
        node?.type !== 'property' ||
        !Array.isArray(node.children) ||
        node.children.length < 2 ||
        offsetInSpans(node.offset, this.contextSpans)
      ) {
        return;
      }

      const [keyNode, valNode] = node.children;
      const term = jsonStringValue(this.text, keyNode);
      if (!term || term.startsWith('@')) return;

      const active = activeJsonLdContextAt(
        this.ast,
        this.text,
        keyNode.offset,
        this.resolvedContext,
      );
      const containers = active.terms.get(term)?.['@container'];
      if (!containers?.length) return;

      if (
        (containers.includes('@language') || containers.includes('@index')) &&
        valNode?.type !== 'object'
      ) {
        diags.push(Diagnostic.create(
          nodeToRange(this.text, valNode),
          `Property "${term}" is defined with @container: ${containers.join(', ')}; JSON-LD expects a map object for this container form.`,
          DiagnosticSeverity.Error,
          this.key,
          'RDFusion'
        ));
      }
    });

    return diags;
  }
}
