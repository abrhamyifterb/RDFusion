/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import {
	validateXsdInteger,
	validateXsdDecimal,
	validateXsdFloat,
	validateXsdDouble,
	validateXsdDate,
} from '../../jsonld-xsd-validator.js';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

const validators: Record<string, (lex: string) => boolean> = {
	'http://www.w3.org/2001/XMLSchema#integer': validateXsdInteger,
	'http://www.w3.org/2001/XMLSchema#decimal': validateXsdDecimal,
	'http://www.w3.org/2001/XMLSchema#float':   validateXsdFloat,
	'http://www.w3.org/2001/XMLSchema#double':  validateXsdDouble,
	'http://www.w3.org/2001/XMLSchema#date':    validateXsdDate,
};

export default class XsdDatatype implements ValidationRule {
	public readonly key = 'xsdTypeCheck';
	private text!: string; 
	private ast!: Node;
	private contextMap!: Map<string,string>;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
		this.contextMap = ctx.contextMap;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				nodeText(this.text, node?.children![0]) === '"@type"'
			) {
				const dtNode = node?.children![1];
				const dt = nodeText(this.text, dtNode).slice(1,-1);
				
				const lexEntry = node?.parent?.children?.find(c => c?.children?.[0] && nodeText(this.text, c.children[0]) === '"@value"');
				
				// console.dir(lexEntry);
				const fullIri = this.expandPrefix(dt);

				if (lexEntry && lexEntry.children?.[1]) {
					const lexNode = lexEntry.children[1];
					const lex = nodeText(this.text, lexNode).slice(1, -1);
					if (validators[fullIri] && !validators[fullIri](lex)) {
						diags.push(Diagnostic.create(
							nodeToRange(this.text, lexNode),
							`Invalid lexical form for datatype <${dt}>: "${lex}".`,
							DiagnosticSeverity.Error,
							"RDFusion"
						));
					}
				}
			}
		});
		return diags;
	}

	private expandPrefix(dt:string) : string {
		if (dt.includes(':') && !/^https?:\/\//.test(dt)) {
			const [prefix, local] = dt.split(':',2);
			const ns = this.contextMap.get(prefix);
			if (ns) {
				return ns.endsWith('#')  
						? `${ns}${local}` 
						: `${ns}#${local}`;
			}
		} 

		return dt;
	}
}
