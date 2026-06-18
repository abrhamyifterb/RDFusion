/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  activeJsonLdContextAt,
  collectContextValueSpans,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

const JSON_LD_LITERAL_SCALARS = new Set<Node['type']>(['number', 'boolean']);

export default class NonStringLiteral implements ValidationRule {
	public readonly key = 'nonStringLiteral';
	private text!: string; 
	private ast!: Node;
  private resolvedContext?: ResolvedContext;
  private contextSpans: { start: number; end: number }[] = [];

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
    this.resolvedContext = ctx.resolvedContext;
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
      if (!node || !JSON_LD_LITERAL_SCALARS.has(node.type)) return;
      if (offsetInSpans(node.offset, this.contextSpans)) return;

      const parent = node.parent;
      if (
        parent?.type !== 'property' ||
        !Array.isArray(parent.children) ||
        parent.children.length < 2 ||
        parent.children[1] !== node
      ) {
        return;
      }

      const keyNode = parent.children[0];
      const key = propertyKeyName(this.text, parent);
      if (!key || key.startsWith('@')) return;

      const active = activeJsonLdContextAt(
        this.ast,
        this.text,
        keyNode.offset,
        this.resolvedContext,
      );
      const termType = active.terms.get(key)?.['@type'];
      if (termType === '@id' || termType === '@vocab') return;

			diags.push(Diagnostic.create(
				nodeToRange(this.text, node),
        `JSON-LD allows ${nodeText(this.text, node)} as a literal value. Use a value object with @type if a specific datatype was intended.`,
				DiagnosticSeverity.Warning,
				this.key,
				'RDFusion'
			));
		});
		return diags;
	}
}
