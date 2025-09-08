import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }       from '../../../utils';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';

export default class NonStringIdCheck implements ValidationRule {
	public readonly key = 'nonStringId';
	private ast!: Node;
	private text!: string;
	private contextSpan: { start: number; end: number } | null = null;

	init(ctx: { ast: Node; text: string }) {
		this.ast  = ctx.ast;
		this.text = ctx.text;
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				Array.isArray(node.children) && node.children.length >= 2 &&
				nodeText(this.text, node.children[0]) === '"@context"'
			) {
				const val = node.children[1];
				this.contextSpan = { start: val.offset, end: val.offset + val.length };
			}
		});
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
		if (
			node?.type === 'property' &&
			Array.isArray(node.children) && node.children.length >= 2 &&
			nodeText(this.text, node.children[0]) === '"@id"'
		) {
			const val = node.children[1];
			if (
				this.contextSpan &&
				val.offset >= this.contextSpan.start &&
				val.offset < this.contextSpan.end
			) {
				return;
			}
			if (val?.type !== 'string') {
			diags.push(Diagnostic.create(
				nodeToRange(this.text, val),
				'`@id` value must be a JSON string IRI.',
				DiagnosticSeverity.Error,
				'RDFusion'
			));
			}
		}
		});
		return diags;
	}
}
