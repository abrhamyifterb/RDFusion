import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { nodeText, nodeToRange, walkAst } from '../utils.js';

function isContextItem(node: Node | undefined): boolean {
	return !!node && ['string', 'object', 'null'].includes(node.type);
}

export default class ContextTypeCheck implements ValidationRule {
	public readonly key = 'contextType';
	private ast!: Node;
	private text!: string;

	init(ctx: { ast: Node; text: string }) {
		this.ast = ctx.ast;
		this.text = ctx.text;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (
				node?.type !== 'property' ||
				!Array.isArray(node.children) ||
				node.children.length < 2 ||
				nodeText(this.text, node.children[0]) !== '"@context"'
			) {
				return;
			}
			const valNode = node.children[1];
			if (!valNode) return;
			if (valNode.type === 'array') {
				for (const item of valNode.children ?? []) {
					if (!isContextItem(item)) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text, item),
							'`@context` arrays may contain strings, objects, or null values.',
							DiagnosticSeverity.Error,
							this.key,
							'RDFusion'
						));
					}
				}
				return;
			}
			if (!isContextItem(valNode)) {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, valNode),
					'`@context` value must be a string, object, array of contexts, or null.',
					DiagnosticSeverity.Error,
					this.key,
							'RDFusion'
				));
			}
		});
		return diags;
	}
}
