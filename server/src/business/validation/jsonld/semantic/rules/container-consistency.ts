import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { Node } from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ContainerUsageCheck implements ValidationRule {
	public readonly key = 'containerUsage';
	private ast!: Node;
	private text!: string;

	init(ctx: { ast: Node; text: string }) {
		this.ast  = ctx.ast;
		this.text = ctx.text;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];

		let contextSpan: { start: number; end: number } | null = null;
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				nodeText(this.text, node.children![0]) === '"@context"'
			) {
				const valNode = node.children![1];
				contextSpan = {
				start: valNode?.offset,
				end: valNode?.offset + valNode.length
				};
			}
		});

		const contextMap = new Map<string, string[]>();
		if (contextSpan) {
			walkAst(this.ast, node => {
				if (
				node?.type === 'property' &&
				node?.offset >= contextSpan!.start &&
				node?.offset < contextSpan!.end
				) {
				const keyNode = node.children![0];
				const valNode = node.children![1];
				const term = nodeText(this.text, keyNode).slice(1, -1);

				if (valNode?.type === 'object') {
					for (const inner of valNode.children ?? []) {
					const innerKey = nodeText(this.text, inner.children![0]);
					if (innerKey === '"@container"') {
						const containerNode = inner.children![1];
						if (containerNode?.type === 'string') {
						const c = JSON.parse(nodeText(this.text, containerNode));
						contextMap.set(term, [c]);
						} else if (containerNode?.type === 'array') {
						const arr: string[] = [];
						for (const item of containerNode.children ?? []) {
							if (item?.type === 'string') {
							arr.push(JSON.parse(nodeText(this.text, item)));
							}
						}
						contextMap.set(term, arr);
						}
					}
					}
				}
				}
			});
		}

		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				!(contextSpan && node?.offset >= contextSpan.start && node?.offset < contextSpan.end)
			) {
				const [ keyNode, valNode ] = node.children!;
				const term = nodeText(this.text, keyNode).slice(1, -1);
				const containers = contextMap.get(term);
				if (!containers) {return;}

				if (
				(containers.includes('@list') || containers.includes('@set'))
				&& valNode?.type !== 'array'
				) {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, valNode),
					`Property "${term}" is defined with @container:${containers.join(',')} so its value must be an array.`,
					DiagnosticSeverity.Error,
					'RDFusion'
				));
				}

				if (
				(containers.includes('@language') || containers.includes('@index'))
				&& valNode?.type !== 'object'
				) {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, valNode),
					`Property "${term}" is defined with @container:${containers.join(',')} so its value must be an object.`,
					DiagnosticSeverity.Error,
					'RDFusion'
				));
				}
			}
		});

		return diags;
	}
}
