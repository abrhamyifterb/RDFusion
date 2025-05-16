import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

export default class ContextVocab implements ValidationRule {
	public readonly key = 'vocabCheck';
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
			nodeText(this.text, node.children![0]) === '"@vocab"'
		) {
			const val = node.children![1];
			if (val?.type === 'string') {
				const raw = this.text.slice(val.offset+1, val.offset+val.length-1);
				try { 
					new URL(raw); 
				}
				catch {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, val),
						'Invalid @vocab IRI.',
						DiagnosticSeverity.Warning
					));
				}
			} else if (val.type !== 'null') {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, val),
					'`@vocab` must be an IRI or null.',
					DiagnosticSeverity.Warning,
					"RDFusion"
				));
			}
		}
		});
		return diags;
	}
}
