/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class UndefinedPrefix implements ValidationRule {
	public readonly key = 'undefinedPrefix';
	private ctx!: Map<string,string>;
	private ast!: Node; private text!: string;

	init(ctx: any) {
		this.ctx = ctx.contextMap;
		this.ast = ctx.ast;
		this.text = ctx.text;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		const keywords = new Set([
			'@id','@type','@value','@language','@list','@set','@context','@graph'
		]);

    const absoluteIRI = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
		walkAst(this.ast, node => {
			if (node?.type === 'property') {
				const key = nodeText(this.text, node.children![0]).slice(1,-1);
				if (key.includes(':') && !keywords.has(key) && !absoluteIRI.test(key)) {
					const prefix = key.split(':',1)[0];
					if (!this.ctx.has(prefix)) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text,node.children![0]),
							`Undefined prefix "${prefix}" in property "${key}".`,
							DiagnosticSeverity.Error,
							"RDFusion"
						));
					}
				}
			}
		});
		return diags;
	}
}
