/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity }   from 'vscode-languageserver';
import { LiteralInfo, TtlValidation } from '../../../../../utils/shared/turtle/ttl-types';

export default class MissingDatatypeOrLang implements TtlValidation {
	private lits!: LiteralInfo[];
	public readonly key = 'missingTagCheck';

	init(literals: LiteralInfo[]) {
		this.lits = literals; 
	}

	run(): Diagnostic[] {
		return this.lits
			.filter(l => !l.datatype && !l.language && typeof l.value === "string" && l.value.startsWith('"') && l.value.endsWith('"'))
			.map(l => Diagnostic.create(
				l.range,
				`Literal ${(l.value)} is missing a datatype or language tag.`,
				DiagnosticSeverity.Warning,
				"RDFusion"
		));
	}
}
