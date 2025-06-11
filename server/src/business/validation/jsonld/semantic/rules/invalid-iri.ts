/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { parse as parseIri }   from 'uri-js';
import { Node }                from 'jsonc-parser';
import { nodeToRange } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class InvalidIri implements ValidationRule {
	public readonly key = 'invalidIriCheck';
	private contextMap!: Map<string,string>;
	private ast!: Node;
	private text!: string;
	private definitions!: { id:string, range:any, typeIri?:string, typeRange?:any }[];
	private baseOffset: number | null = null;

	init(ctx: {
		text: string;
		ast: Node;
		contextMap: Map<string,string>;
		definitions: { id:string, range:any, typeIri?:string, typeRange?:any }[];
	}) {
		this.text        = ctx.text;
		this.ast         = ctx.ast;
		this.contextMap  = ctx.contextMap;
		this.definitions = ctx.definitions;

		const baseProp = this.ast.children?.find(child => 
			child.type === 'property'
			&& child.children![0].type === 'string' 
			&& this.text.slice(child.children![0].offset + 1, child.children![0].offset + child.children![0].length)
		);
		if(baseProp) {
			this.baseOffset = baseProp.children![1].offset;
		}
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		// const isAbsolute = (v: string) => !!parseIri(v).scheme;
		const isAbsolute = (v: string) => {
			if(parseIri(v).scheme) return true;
			const [pfx] = v.split(':', 1);
			return this.contextMap.has(pfx);
		};
		// for (const [term, iri] of this.contextMap) {
		// 	if (typeof iri === 'string') {
		// 		this.validateIri(term, iri, diags);
		// 		continue;
		// 	}

		// 	if (iri && typeof iri === 'object' && typeof (iri as any)['@id'] === 'string') {
		// 		this.validateIri(term, (iri as any)['@id'], diags);
		// 		continue;
		// 	}
		// }

		for (const d of this.definitions) {
			if (!isAbsolute(d.id) 
				&& !d.id.includes(':')
				&& this.baseOffset !== null
				&& d.range.start?.character >= this.baseOffset
			) { /* empty */ }
			else if (!isAbsolute(d.id)) {
				diags.push(Diagnostic.create(
					d.range,
					`Invalid @id IRI: ${d.id}`,
					DiagnosticSeverity.Error,
					"RDFusion"
				));
			}

			// if (d.typeIri && !isAbsolute(d.typeIri) && !d.typeIri.includes(':')) {
			if(d.typeIri) {
				const typeRange = d.typeRange ?? d.range;
				if(!isAbsolute(d.typeIri) 
					&& !(this.baseOffset !== null)	
					&& typeRange.start?.character >= this.baseOffset!
				)
				{diags.push(Diagnostic.create(
					d.typeRange ?? d.range,
					`Invalid @type IRI: ${d.typeIri} - @id IRI: ${d.id}`,
					DiagnosticSeverity.Warning,
					"RDFusion"
				));}
			}
		}

		return diags;
	}

	private validateIri(
		term: string,
		iri: string,
		diags: Diagnostic[],
		messagePrefix = `Invalid context IRI for term`
		) {
		try {
			if (/\s/.test(iri)) {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, this.ast),
					`Invalid context IRI for term "${term}": ${iri}`,
					DiagnosticSeverity.Error,
					"RDFusion"
				));
			}
			new URL(iri);
		} catch {
			diags.push(
				Diagnostic.create(
				nodeToRange(this.text, this.ast),
				`${messagePrefix} "${term}": ${iri}`,
				DiagnosticSeverity.Error,
				"RDFusion"
				)
			);
		}
	}
}
