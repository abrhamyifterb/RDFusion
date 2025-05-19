/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';


export default class NonStringLiteral implements ValidationRule {
	public readonly key = 'nonStringLiteral';
	private text!: string; 
	private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (node?.type === 'string' || node.type === 'number' || node.type === 'boolean') {
				const parent = node.parent!;
				if (!(parent.type === 'property' && nodeText(this.text, parent.children![0]) === '"@value"')) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, node),
						`Literal ${nodeText(this.text,node)} without explicit datatype or language.`,
						DiagnosticSeverity.Warning,
						"RDFusion"
					));
				}
			}
		});
		return diags;
	}
}
