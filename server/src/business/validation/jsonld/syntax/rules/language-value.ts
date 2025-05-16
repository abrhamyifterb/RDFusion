import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

export default class LanguageValue implements ValidationRule {
	public readonly key = 'languageValueCheck';
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
			nodeText(this.text, node.children![0]) === '"@language"'
		) {
			const parent = node.parent!;
			const valueProp = parent.children!.find(c =>
			nodeText(this.text, c.children![0]) === '"@value"'
			);
			if (valueProp) {
				const val = valueProp.children![1];
				if (val?.type !== 'string' && val?.type !== 'null') {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, val),
						'Only strings may be language-tagged.',
						DiagnosticSeverity.Warning,
						"RDFusion"
					));
				}
			}
		}
		});
		return diags;
	}
}
