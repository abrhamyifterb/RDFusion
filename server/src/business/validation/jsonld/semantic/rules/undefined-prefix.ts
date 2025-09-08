/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

import URI from 'uri-js';
import { getIanaSchemes } from '../../../iana-schemes.js';

export default class UndefinedPrefix implements ValidationRule {
	public readonly key = 'undefinedPrefix';
	private ctx!: Map<string,string>;
	private ast!: Node; private text!: string;
	private iana = new Set<string>();

	async init(ctx: any) {
		this.ctx = ctx.contextMap;
		this.ast = ctx.ast;
		this.text = ctx.text;
		try {
			this.iana = await getIanaSchemes();
		} catch {
			this.iana = new Set();
		}
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		const keywords = new Set([
			'@id','@type','@value','@language','@list','@set','@context','@graph'
		]);

    const absoluteIRI = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				Array.isArray(node.children) &&
				node.children.length >= 1
			) {
				const key = nodeText(this.text, node.children[0]).slice(1,-1);
				const parsed = URI.parse(key);

				if (parsed.scheme && this.iana.size > 0) {		
					if(parsed.error) {
						if (parsed.error) {
							diags.push(Diagnostic.create(
							nodeToRange(this.text,node.children[0]),
							`Invalid IRI syntax: ${parsed.error}`,
							DiagnosticSeverity.Warning,
							this.key
							));
							return;
						}
					}
					else if(this.iana.has((parsed.scheme || '').toLowerCase())) {return;}
				}
				
				if (key.includes(':') && !keywords.has(key) && !absoluteIRI.test(key)) {
					const prefix = key.split(':',1)[0];
					if (!this.ctx.has(prefix)) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text,node.children[0]),
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
