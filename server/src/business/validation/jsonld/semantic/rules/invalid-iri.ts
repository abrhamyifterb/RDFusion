/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import URI                                from 'uri-js';
import { Node }                          from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';
import { ValidationRule }                from '../../../utils.js';
import { getIanaSchemes }                from '../../../iana-schemes.js';

export default class InvalidIri implements ValidationRule {
	public readonly key = 'invalidIriCheck';

	private text!: string;
	private ast!: Node;
	private contextMap!: Map<string,string>;
	private iana = new Set<string>();

	public async init(ctx: { text: string; ast: Node; contextMap: Map<string,string> }) {
		this.text       = ctx.text;
		this.ast        = ctx.ast;
		this.contextMap = ctx.contextMap;
		try {
			this.iana = await getIanaSchemes();
		} catch {
			this.iana = new Set();
		}
	}

	public run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
	
		const checkIri = (iri: string, range: any, severity: DiagnosticSeverity) => {
			if (iri.startsWith('_:')) {return;}
		
			const parsed = URI.parse(iri);
			if (parsed.error) {
				diags.push(Diagnostic.create(
					range,
					`Invalid IRI syntax: ${parsed.error}`,
					severity,
					this.key
				));
				return;
			}
		
			let scheme = (parsed.scheme || '').toLowerCase();
			if (scheme.endsWith(':')) {
				scheme = scheme.slice(0, -1);
			}
		
			if (scheme && this.iana.has(scheme)) {
				return;  
			}
		
			// eslint-disable-next-line no-useless-escape
			if (/^[A-Za-z][A-Za-z0-9+.\-]*:\/\//.test(iri)) {
				return;
			}
		
			if (iri.includes(':')) {
				const [prefix] = iri.split(':', 1);
				if (!this.contextMap.has(prefix)) {
					diags.push(Diagnostic.create(
						range,
						`Undefined prefix "${prefix}" in IRI "${iri}".`,
						DiagnosticSeverity.Error,
						this.key
					));
				}
				return;
			}
		};
	
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				Array.isArray(node.children) &&
				node.children.length === 2
			) {
				const key = nodeText(this.text, node.children[0]).slice(1, -1);
				const val = node.children[1];
		
				if (key === '@id' || key === '@type') {
					if (val?.type === 'string') {
						const iri = JSON.parse(nodeText(this.text, val));
						checkIri(iri, nodeToRange(this.text, val),
								key === '@id' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning);
					}
					else if (val?.type === 'array') {
						for (const elt of val.children || []) {
							if (elt?.type === 'string') {
								const iri = JSON.parse(nodeText(this.text, elt));
								checkIri(iri, nodeToRange(this.text, elt),
										key === '@id' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning);
							}
						}
					}
				}
			}
		});
	
		return diags;
	}
}
