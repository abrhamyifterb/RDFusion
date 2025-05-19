/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class ContainerConsistency implements ValidationRule {
	public readonly key = 'containerConsistencyCheck';
	private ast!: Node; 
	private text!: string; 
	private contextMap!: Map<string, string>;

	init(ctx: any) {
		this.ast = ctx.ast;
		this.text = ctx.text;
		this.contextMap = ctx.contextMap;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		const containers = new Map<string, string>();
		
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				node.children && node.children[0] && nodeText(this.text, node.children[0]) === '"@container"'
			) {
				const containerType = node.children[1] ? nodeText(this.text, node.children[1]).slice(1, -1) : '';
				const termNode = node.parent?.parent?.children ? node.parent.parent.children[0] : undefined;
				const term = termNode ? nodeText(this.text, termNode).slice(1, -1) : '';
				if (term && containerType) {
					containers.set(term, containerType);
				}
			}
		});

		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				node.children && node.children[1] && node.children[1].type !== 'null'
			) {
				const key = nodeText(this.text, node.children[0]).slice(1, -1);
				const expected = containers.get(key);

				if (expected === '@list' && node.children[1].type !== 'array') {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, node.children[1]),
						`Property "${key}" defined as @list but value is not an array. ${node.children[1].type}`,
						DiagnosticSeverity.Warning
					));
				}

				if (expected === '@set' && !['array', 'object'].includes(node.children[1].type)) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, node.children[1]),
						`Property "${key}" defined as @set but value is not an array or object.`,
						DiagnosticSeverity.Warning
					));
				}
			}
		});

		return diags;
	}
}
