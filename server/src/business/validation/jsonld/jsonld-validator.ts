import {
	Diagnostic,
	TextDocuments
} from "vscode-languageserver/node.js";
import { DataManager } from '../../../data/data-manager';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { syntaxRules } from './syntax/index.js';
import { semanticRules } from './semantic/index.js';
import { literalRules } from './literal/index.js';
import { JsonldParsedGraph } from '../../../data/irdf-parser.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings.js';
import { ShaclValidator } from '../shacl-validator';
import { IRdfValidator } from '../irdf-validator';
import { DuplicateChecker } from '../turtle/duplicate-finder';
import JsonLdIriSchemeCheck from './iri-scheme-validator';

export class JsonLdValidator implements IRdfValidator {
	private jsonldValidationConfig;
	private commonValidationConfig;
	constructor(
		private dataManager: DataManager,
		private documents: TextDocuments<TextDocument>,
		configSettings: RDFusionConfigSettings
	) {
		this.jsonldValidationConfig = configSettings.jsonld.validations;
		this.commonValidationConfig = configSettings.common.validations;
	}

	async validate(uri: string, shaclValidator: ShaclValidator): Promise<Diagnostic[]> {
		const diags: Diagnostic[] = [];

		const parsed = this.dataManager.getParsedData(uri);
		
		if ((parsed as JsonldParsedGraph) && (parsed as JsonldParsedGraph).diagnostics?.length) {
			diags.push(...(parsed as JsonldParsedGraph).diagnostics);
		}

		if (!parsed || diags.length > 0) {
			return diags;
		}

		const enabledMap = this.jsonldValidationConfig;

		for (const rule of syntaxRules) {
			if ((rule.key in enabledMap) && !enabledMap[rule.key]) {
				continue;
			}
			rule.init(parsed as JsonldParsedGraph);
			diags.push(...rule.run());
		}
		
		for (const rule of semanticRules) {
			if ((rule.key in enabledMap) && !enabledMap[rule.key]) {
				continue;
			}
			rule.init(parsed as JsonldParsedGraph);
			diags.push(...rule.run());
		} 

		for (const rule of literalRules) {
			if ((rule.key in enabledMap) && !enabledMap[rule.key]) {
				continue;
			}
			rule.init(parsed as JsonldParsedGraph);
			diags.push(...rule.run());
		}

		if(enabledMap['duplicateTriple']){
			const dupliValidator = new DuplicateChecker();
			const duplDiags = await dupliValidator.validate(parsed as JsonldParsedGraph);
			diags.push(...duplDiags);
		}

		if(this.commonValidationConfig['iriSchemeCheck']){
			const iriValidator = new JsonLdIriSchemeCheck();
			await iriValidator.init(parsed as JsonldParsedGraph, this.commonValidationConfig);
			const iriDiags = await iriValidator.run();
			diags.push(...iriDiags);
		}

		//const existingErrors = diags.some(d => d.severity === DiagnosticSeverity.Error);

		if (/*!existingErrors && */enabledMap['shaclConstraint']) {
			if (parsed) {
				const shaclDiags = await shaclValidator.validate(parsed);
				diags.push(...shaclDiags);
			}
		}

		return diags;
	}
}
