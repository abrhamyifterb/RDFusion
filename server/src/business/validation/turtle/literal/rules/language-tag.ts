import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { parse as parseBcp47 }            from 'bcp-47';
import { LiteralInfo, TtlValidation } from '../../../../../utils/shared/turtle/ttl-types';

export default class LanguageTagRule implements TtlValidation {
	private lits!: LiteralInfo[];
	public readonly key = 'languageTag';
	
	init(literals: LiteralInfo[]) { 
		this.lits = literals; 
	}

	run(): Diagnostic[] {
		return this.lits
			.filter(l => l.language !== undefined)
			.flatMap(l => {
				const tag = l.language!;
				const parsed = parseBcp47(tag);
				if (!parsed || !parsed.language) {
					return [Diagnostic.create(
						l.range,
						`Invalid BCP-47 language tag: "${tag}".`,
						DiagnosticSeverity.Warning,
						"RDFusion"
					)];
				}
			return [];
		});
	}
}
