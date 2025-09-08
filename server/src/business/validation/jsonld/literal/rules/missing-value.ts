import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class MissingValue implements ValidationRule {
	public readonly key = 'missingValueCheck';
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
				Array.isArray(node.children) &&
				node.children.length >= 2 &&
				nodeText(this.text, node.children[0]) === '"@value"'
			) {
				const valNode = node.children[1];
				if (valNode?.type === 'null') {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, valNode),
						'Literal value cannot be null.',
						DiagnosticSeverity.Error,
						"RDFusion"
					));
				}
			}
		});
		return diags;
	}
}
