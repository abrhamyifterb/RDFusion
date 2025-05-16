import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import {
	validateXsdInteger,
	validateXsdDecimal,
	validateXsdFloat,
	validateXsdDouble,
	validateXsdDate,
	validateXsdBoolean,
} from '../../../xsd-validator.js';
import { LiteralInfo, TtlValidation } from '../../../../../utils/shared/turtle/ttl-types';

const validators: Record<string,(v:string)=>boolean> = {
	'http://www.w3.org/2001/XMLSchema#integer': validateXsdInteger,
	'http://www.w3.org/2001/XMLSchema#decimal': validateXsdDecimal,
	'http://www.w3.org/2001/XMLSchema#float':   validateXsdFloat,
	'http://www.w3.org/2001/XMLSchema#double':  validateXsdDouble,
	'http://www.w3.org/2001/XMLSchema#date':    validateXsdDate,
	'http://www.w3.org/2001/XMLSchema#boolean': validateXsdBoolean,
};

export default class XsdLexicalRule implements TtlValidation {
	private lits!: LiteralInfo[];
	public readonly key = 'xsdTypeCheck';

	init(literals: LiteralInfo[]) { 
		this.lits = literals; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		for (const l of this.lits) {
			if (l.datatype && validators[l.datatype]) {
				if (!validators[l.datatype](l.value)) {
					diags.push(Diagnostic.create(
						l.range,
						`Invalid lexical form for datatype <${l.datatype}>: "${l.value}".`,
						DiagnosticSeverity.Error,
						"RDFusion"
					));
				}
			}
		}
		return diags;
	}
}
