/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity, Range, TextDocuments } from 'vscode-languageserver';
import { parseGenericIriScheme } from '../iri-parse.js';
import { computeLineColumn } from '../../../data/compute-line-column.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getIanaSchemes } from '../iana-schemes.js';

const IRI_PUNCTUATION_REGEX = /<([^>]+)>(?:[ \t]*([.;])[ \t]*)?/g;
const BASE_REGEX = /@base\s*<([^>]+)>\s*\./gi;

export class IriSchemeValidator {
	private readonly key = 'iriSchemeCheck';

	constructor(
		private documents: TextDocuments<TextDocument>
	) {}

	public async validate(uri: string, cfg: any): Promise<Diagnostic[]> {
		const text = this.documents.get(uri)?.getText();
		if (!text) return [];

		let iana: Set<string>;
		try {
			iana = await getIanaSchemes();
		} catch (err: any) {
			console.warn('RDFusion could not load the IRI scheme list; scheme validation will be skipped for this pass.', err);
			iana = new Set();
		}

		const baseInfo = this.extractBase(text);
		const diags: Diagnostic[] = [];
		let match: RegExpExecArray | null;

		while ((match = IRI_PUNCTUATION_REGEX.exec(text))) {
			const [fullMatch, inside, punct] = match;
			const startOffset = match.index;
			const endOffset   = startOffset + fullMatch.length - (punct?.length || 0);
			const range = Range.create(
				computeLineColumn(text, startOffset),
				computeLineColumn(text, endOffset)
			);

			const parsed = parseGenericIriScheme(inside);
			if (parsed.error) {
				diags.push(
					Diagnostic.create(
						range,
						`Invalid IRI syntax: ${parsed.error}`,
						DiagnosticSeverity.Warning,
						this.key,
						'RDFusion'
					)
				);
				continue;
			}

			const scheme = parsed.scheme ?? '';
			if (scheme) {
				if (cfg.strictSchemeCheck) {
				const allowed = new Set(
					String(cfg.customIriScheme ?? '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
				);
				if (!allowed.has(scheme)) {
					diags.push(
						Diagnostic.create(
							range,
							`IRI scheme "${scheme}:" is not in the custom allowed list.`,
							DiagnosticSeverity.Warning,
							this.key,
							'RDFusion'
						)
					);
				}
				} else {
					if (!iana.has(scheme)) {
						diags.push(
							Diagnostic.create(
								range,
								`IRI scheme "${scheme}:" is not registered with IANA.`,
								DiagnosticSeverity.Warning,
								this.key,
								'RDFusion'
							)
						);
					}
				}
			} else if (!(baseInfo && startOffset > baseInfo.offset)) {
				diags.push(
					Diagnostic.create(
						range,
						`Relative IRI "<${inside}>" is used without an @base declaration.`,
						DiagnosticSeverity.Warning,
						this.key,
						'RDFusion'
					)
				);
			}
		}

		return diags;
	}

	private extractBase(text: string) {
		let m: RegExpExecArray | null, found: { base: string; offset: number } | null = null;
		while ((m = BASE_REGEX.exec(text))) {
			found = { base: m[1], offset: m.index };
		}
		return found;
	}
}
