import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

export default class ContextObject implements ValidationRule {
	public readonly key = 'contextObjectCheck';
	private text!: string;
	private ast!: Node;

	public init(ctx: { text: string; ast: Node }) {
		this.text = ctx.text;
		this.ast  = ctx.ast;
	}

	public run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
		if (
			node?.type === 'property' &&
			nodeText(this.text, node.children![0]) === '"@context"'
		) {
			const val = node.children![1];
			if (val?.type !== 'object' && val?.type !== 'null') {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, val),
					'`@context` value must be an object or null.',
					DiagnosticSeverity.Warning,
					"RDFusion"
				));
			}
		}
		});
		return diags;
	}
}
