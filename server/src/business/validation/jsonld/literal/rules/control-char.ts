/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class ControlChar implements ValidationRule {
	public readonly key = 'controlCharCheck';
	private text!: string;
	private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (node?.type === 'string') {
				const str = nodeText(this.text, node).slice(1,-1);
				for (let i=0; i<str.length; i++) {
					const code = str.charCodeAt(i);
					if (code <= 0x1F) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text, node),
							`Unescaped control character U+${code.toString(16).padStart(4,'0')} in string.`,
							DiagnosticSeverity.Error,
							"RDFusion"
						));
						break;
					}
				}
			}
		});
		return diags;
	}
}
