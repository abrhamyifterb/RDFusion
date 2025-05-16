/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

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
				nodeText(this.text, node.children![0]) === '"@list"'
			) {
				const valueNode = node.children![1];
				if (valueNode?.type !== 'array') {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, valueNode),
						'`@list` value must be an array.',
						DiagnosticSeverity.Warning,
						"RDFusion"
					));
				}
			}
		});

		return diags;
	}
}
