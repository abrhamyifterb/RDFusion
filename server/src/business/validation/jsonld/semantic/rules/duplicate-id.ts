/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';

export default class DuplicateId implements ValidationRule {
	public readonly key = 'duplicateId';
	private defs!: any[];

	init(ctx: any) { 
		this.defs = ctx.definitions; 
	}

	run(): Diagnostic[] {
		const seen = new Map<string,any>();
		const diags: Diagnostic[] = [];
		if (!Array.isArray(this.defs)) {
			return [];
		}
		for (const d of this.defs) {
			if (seen.has(d.id)) {
				diags.push(Diagnostic.create(
					d.range,
					`Duplicate @id "${d.id}" in @graph.`,
					DiagnosticSeverity.Warning,
					"RDFusion"
				));
			} else {
				seen.set(d.id, d);
			}
		}
		return diags;
	}
}
