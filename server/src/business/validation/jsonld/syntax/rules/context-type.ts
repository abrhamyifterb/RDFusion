import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { nodeText, nodeToRange } from '../utils.js';

export default class ContextTypeCheck implements ValidationRule {
	public readonly key = 'contextType';
	private ast!: Node;
	private text!: string;

	init(ctx: { ast: Node; text: string }) {
		this.ast = ctx.ast;
		this.text = ctx.text;
	}

	run(): Diagnostic[] {
		if (this.ast?.type !== 'object') {return [];}
	
		const diags: Diagnostic[] = [];
		for (const prop of this.ast.children ?? []) {
			const [keyNode, valNode] = prop.children!;
			if (nodeText(this.text, keyNode) === '"@context"') {
				if (!['string', 'object', 'array'].includes(valNode?.type)) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, valNode),
						'`@context` value must be a string, object, or array of contexts.',
						DiagnosticSeverity.Error,
						'RDFusion'
					));
				}
			}
		}
		return diags;
	}
}