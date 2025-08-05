/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';

export default class MissingType implements ValidationRule {
	public readonly key = 'missingType';
	private defs!: any[]; 
	private text!: string;

	init(ctx: any) { 
		this.defs = ctx.definitions; 
	}

	run(): Diagnostic[] {
		if (!Array.isArray(this.defs)) {
			return [];
		}
		return this.defs
			.filter(d => !d?.typeIri)
			.map(d => Diagnostic.create(
				d.range,
				`Missing @type for node <${d.id}>.`,
				DiagnosticSeverity.Warning,
				"RDFusion"
			));
	}
}
