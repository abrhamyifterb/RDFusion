/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class JsonLiteral implements ValidationRule {
	public readonly key = 'jsonLiteralCheck';
	private text!: string; 
	private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				nodeText(this.text, node.children![0]) === '"@type"'
			) {
				const dt = nodeText(this.text, node.children![1]).slice(1,-1);
				if (dt === '@json' || dt.endsWith('#JSON')) {
					const lexNode = node.parent!.children!.find(c =>
						nodeText(this.text, c.children![0]) === '"@value"'
					)!.children![1];
					try {
						JSON.parse(nodeText(this.text, lexNode).slice(1,-1));
					} catch (e:any) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text, lexNode),
							`Invalid JSON literal: ${e.message}`,
							DiagnosticSeverity.Error,
							"RDFusion"
						));
					}
				}
			}
		});
		return diags;
	}
}
