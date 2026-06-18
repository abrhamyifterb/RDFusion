/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class MissingTypeOrLang implements ValidationRule {
	public readonly key = 'missingTagCheck';
	private text!: string; 
	private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (node?.type === 'object' && node.children) {
				const keys = node.children.map(c =>
					Array.isArray(c.children) && c.children.length > 0
						? nodeText(this.text, c.children[0])
						: ''
				);
				if (
					keys.includes('"@value"') && 
					!keys.includes('"@type"') && 
					!keys.includes('"@language"')
				) {
					//const valProp = node.children.find(c => nodeText(this.text, c.children![0]) === '"@value"')!;
					const valProp = node.children.find(c =>
						Array.isArray(c.children) &&
						c.children.length > 0 &&
						nodeText(this.text, c.children[0]) === '"@value"'
					);

					if (
						!valProp ||
						!Array.isArray(valProp.children) ||
						valProp.children.length === 0
					) {
						return;
					}

					diags.push(Diagnostic.create(
						nodeToRange(this.text, valProp.children[0]),
						'Value object has @value without @type or @language; JSON-LD will expand it as a plain literal. Add @type or @language only if a typed or language-tagged literal was intended.',
						DiagnosticSeverity.Warning,
						this.key,
							'RDFusion'
					));
				}
			}
		});
		return diags;
	}
}
