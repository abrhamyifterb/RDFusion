import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

const SCALARS = new Set<Node['type']>(['string','number','boolean','null']);

export default class ValueScalar implements ValidationRule {
	public readonly key = 'valueScalarCheck';
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
			nodeText(this.text, node.children![0]) === '"@value"'
		) {
			const val = node.children![1];
			if (!SCALARS.has(val?.type)) {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, val),
					'`@value` must be a scalar (string, number, boolean or null).',
					DiagnosticSeverity.Error,
					"RDFusion"
				));
			}
		}
		});
		return diags;
	}
}
