import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';

export default class RootTypeCheck implements ValidationRule {
	public readonly key = 'rootType';
	private ast!: Node;

	init(ctx: { ast: Node }) {
		this.ast = ctx.ast;
	}

	run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		if (this.ast?.type !== 'object' && this.ast?.type !== 'array') {
			diags.push(
				Diagnostic.create(
					Range.create(0, 0,0,1 ),
					'JSON-LD document root must be a JSON object or an array of JSON objects.',
					DiagnosticSeverity.Error,
					'RDFusion'
				)
			);
		}
		return diags;
	}
}