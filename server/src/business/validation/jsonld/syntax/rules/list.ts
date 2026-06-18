/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

function isJsonLdValueNode(node: Node | undefined): boolean {
	return !!node && ['string', 'number', 'boolean', 'null', 'object', 'array'].includes(node.type);
}

export default class ListRule implements ValidationRule {
	public readonly key = 'listCheck';
	private text!: string;
	private ast!: Node;

	public init(ctx: { text: string; ast: Node; contextMap: Map<string,string>; definitions: any[] }) {
		this.text = ctx.text;
		this.ast  = ctx.ast;
	}

	public run(): Diagnostic[] {
		const diags: Diagnostic[] = [];

		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				Array.isArray(node.children) &&
				node.children.length >= 2 &&
				nodeText(this.text, node.children[0]) === '"@list"'
			) {
				const valueNode = node.children[1];
				if (!isJsonLdValueNode(valueNode)) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, valueNode),
						'`@list` value must be a JSON-LD value, node object, value object, or an array of those values.',
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
