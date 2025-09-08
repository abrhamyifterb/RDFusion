import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }               from '../../../utils';
import { Node }                         from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class InvalidTypeValue implements ValidationRule {
	public readonly key = 'invalidTypeValue';
	private ast!: Node;
	private text!: string;
	private contextSpan: { start: number; end: number } | null = null;

	init(ctx: { ast: Node; text: string }) {
		this.ast  = ctx.ast;
		this.text = ctx.text;
		walkAst(this.ast, n => {
		if (
			n?.type === 'property' &&
			Array.isArray(n.children) && n.children.length >= 2 &&
			nodeText(this.text, n.children[0]) === '"@context"'
		) {
			const v = n.children[1];
			this.contextSpan = { start: v.offset, end: v.offset + v.length };
		}
		});
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
		if (
			node?.type === 'property' &&
			Array.isArray(node.children) && node.children.length >= 2 &&
			nodeText(this.text, node.children[0]) === '"@type"'
		) {
			const val = node.children[1];
			if (
				this.contextSpan &&
				val.offset >= this.contextSpan.start &&
				val.offset < this.contextSpan.end
			) {return;}

			const isString =
			val?.type === 'string';
			const isArrayOfString =
			val?.type === 'array' &&
			(val.children ?? []).every(c => c?.type === 'string');

			if (!isString && !isArrayOfString) {
			diags.push(Diagnostic.create(
				nodeToRange(this.text, val),
				'`@type` value must be a string or an array of strings.',
				DiagnosticSeverity.Error,
				'RDFusion'
			));
			}
		}
		});
		return diags;
	}
}
