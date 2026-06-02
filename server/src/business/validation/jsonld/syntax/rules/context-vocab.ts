import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import URI from 'uri-js';

function isCompactIriReference(value: string): boolean {
	return /^[A-Za-z_][\w-]*:[^/]*$/.test(value);
}

function isValidVocabMapping(value: string): boolean {
	if (!value) return false;
	if (isCompactIriReference(value)) return true;
	return !URI.parse(value).error && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

export default class ContextVocab implements ValidationRule {
	public readonly key = 'vocabCheck';
	private text!: string;
	private ast!: Node;

	public init(ctx: { text: string; ast: Node }) {
		this.text = ctx.text;
		this.ast  = ctx.ast;
	}

	public run(): Diagnostic[] {
		const diags: Diagnostic[] = [];
		walkAst(this.ast, node => {
		if (
			node?.type === 'property' &&
			Array.isArray(node.children) &&
			node.children.length >= 2 &&
			nodeText(this.text, node.children[0]) === '"@vocab"'
		) {
			const val = node.children[1];
			if (val?.type === 'string') {
				const raw = this.text.slice(val.offset+1, val.offset+val.length-1);
				if (!isValidVocabMapping(raw)) {
					diags.push(Diagnostic.create(
						nodeToRange(this.text, val),
						'Invalid @vocab mapping. Use an absolute IRI, a compact IRI, or null.',
						DiagnosticSeverity.Warning,
						this.key,
							'RDFusion'
					));
				}
			} else if (val?.type !== 'null') {
				diags.push(Diagnostic.create(
					nodeToRange(this.text, val),
					'`@vocab` must be an IRI, a compact IRI, or null.',
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
