/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { parse as parseBcp47 } from 'bcp-47';
import { Node } from 'jsonc-parser';
import { nodeText, nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';

export default class LanguageTag implements ValidationRule {
	public readonly key = 'languageTagCheck';
	private text!: string; 
	private ast!: Node;

	init(ctx: any) { 
		this.text = ctx.text; 
		this.ast = ctx.ast; 
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
			if (
				node?.type === 'property' &&
				nodeText(this.text, node.children![0]) === '"@language"'
			) {
				const langNode = node.children![1];
				if (langNode.type !== 'string') {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, langNode),
					'Language tag must be a JSON string.',
					DiagnosticSeverity.Error
				));
				} else {
				const tag = nodeText(this.text, langNode).slice(1,-1);
				if (!parseBcp47(tag)?.language) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, langNode),
						`Invalid BCP-47 language tag: "${tag}".`,
						DiagnosticSeverity.Warning,
						"RDFusion"
					));
				}
				}
			}
		});
		return diags;
	}
}
