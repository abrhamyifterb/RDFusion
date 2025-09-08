/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';
import { childAt } from '../../../../../utils/shared/jsonld/child-at.js';

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
			if(node?.type !== 'property') {return;}
			const keyNode = childAt(node, 0);
			const valNode = childAt(node, 1);
			if (!keyNode || !valNode) {return;}
			if (
				nodeText(this.text, keyNode) === '"@value"' &&
				valNode?.type === 'string' && 
				/^""$/.test(nodeText(this.text, valNode))
			) {
				//const val = node.children![1];
				diags.push(Diagnostic.create(
					nodeToRange(this.text, valNode),
					'Empty string is not allowed here.',
					DiagnosticSeverity.Error,
					"RDFusion"
				));
		}
		});
		return diags;
	}
}
