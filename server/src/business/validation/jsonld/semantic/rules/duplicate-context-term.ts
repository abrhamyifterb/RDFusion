/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';

export default class DuplicateContextTerm implements ValidationRule {
	public readonly key = 'duplicateContextTermCheck';
	private ctx!: Map<string,string>;

	init(ctx: any) { 
		this.ctx = ctx.contextMap; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		const seen = new Map<string,string>();
		if (!Array.isArray(this.ctx)) {
			return [];
		}
		for (const [term, iri] of this.ctx) {
			if (seen.has(term) && seen.get(term)! !== iri) {
				diags.push(Diagnostic.create(
					Range.create(0,0,0,1),
					`Context term "${term}" redefined from <${seen.get(term)}> to <${iri}>.`,
					DiagnosticSeverity.Error
				));
			}
			seen.set(term, iri);
		}
		return diags;
	}
}
