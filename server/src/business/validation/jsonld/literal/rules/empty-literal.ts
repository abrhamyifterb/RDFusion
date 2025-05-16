/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class EmptyLiteral implements ValidationRule {
	public readonly key = 'emptyLiteral';
	private text!: string; private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				nodeText(this.text, node.children![0]) === '"@value"'
			) {
				const val = node.children![1];
				if (val.type === 'string' && /^""$/.test(nodeText(this.text, val))) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, val),
						'Empty string literal is not allowed.',
						DiagnosticSeverity.Error,
						"RDFusion"
					));
				}
			}
		});
		return diags;
	}
}
