/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	Diagnostic,
	DiagnosticSeverity,
	Range,
	Position,
	TextDocuments,
} from 'vscode-languageserver/node.js';

import { DataManager } from '../../../data/data-manager';

import { buildPrefixMapping, extractLiteralInfos } from '../../../utils/ttl-token-utils.js';
import { IRdfValidator } from '../irdf-validator';
import { ShaclValidator } from '../shacl-validator';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TtlValidation } from '../../../utils/shared/turtle/ttl-types';
import { literalRules } from './literal/index.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

export class TurtleValidator implements IRdfValidator {
	private turtleValidationConfig;
	constructor(
		private dataManager: DataManager, 
		private documents: TextDocuments<TextDocument>,
		configSettings: RDFusionConfigSettings
	) {
		this.turtleValidationConfig = configSettings.turtle.validations;
	}
	
	async validate(uri: string, shaclValidator: ShaclValidator): Promise<Diagnostic[]> {
		const diagnostics: Diagnostic[] = [];
		
		const parsedGraph = this.dataManager.getParsedData(uri) as ParsedGraph;
		if (!parsedGraph) {
			diagnostics.push(Diagnostic.create(
				Range.create(Position.create(0, 0), Position.create(0, 1)),
				"Document could not be parsed; validation aborted.",
				DiagnosticSeverity.Error
			));
			return diagnostics;
		}
		
		if (parsedGraph.errors && parsedGraph.errors.length > 0) {
			diagnostics.push(...this.convertErrors(parsedGraph.errors));
		}
		
		if (diagnostics.length > 0) {
			return diagnostics;
		}

		const prefixMapping = buildPrefixMapping(parsedGraph.tokens);
		const literalInfos = extractLiteralInfos(parsedGraph.tokens, prefixMapping);
		
		const enabledMap = this.turtleValidationConfig;

		for (const rule of literalRules as TtlValidation[]) {
			if ((rule.key in enabledMap) && !enabledMap[rule.key]) {
				continue;
			}
			rule.init(literalInfos);
			diagnostics.push(...rule.run());
		}
		

		if(enabledMap['shaclConstraint']){
			const shaclDiags = await shaclValidator.validate(parsedGraph);
			diagnostics.push(...shaclDiags);
		}

		
		return diagnostics;
	}

	private convertErrors(errs: any[]): Diagnostic[] {
		const diags: Diagnostic[] = [];
		for (const err of errs) {
			if (err && err.token) {
			diags.push(Diagnostic.create(
				err.token.startColumn ? this.tokenToRange(err.token) : this.tokenToRange(err.previousToken),
				err.message || JSON.stringify(err),
				DiagnosticSeverity.Error
			));
			} else {
			diags.push(Diagnostic.create(
				Range.create(0, 0, 0, 1),
				err.message || JSON.stringify(err),
				DiagnosticSeverity.Error
			));
			}
		}
		return diags;
	}

	private tokenToRange(token: any): Range {
		return Range.create(
			(token.startLine || 1) - 1,
			(token.startColumn || 1) - 1,
			(token.endLine || token.startLine || 1) - 1,
			(token.endColumn || token.startColumn || 1) - 1
		);
	}
}
