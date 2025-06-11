/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity, Range, TextDocuments } from 'vscode-languageserver';
import URI from 'uri-js';
import { computeLineColumn } from '../../../data/compute-line-column.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getIanaSchemes } from '../iana-schemes.js';

const IRI_PUNCTUATION_REGEX = /<([^>]+)>(?:[ \t]*([.;])[ \t]*)?/g;
const BASE_REGEX = /@base\s*<([^>]+)>\s*\./gi;

export class IriSchemeValidator {
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
			console.warn('Could not load IANA schemes, skipping strict checks:', err);
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

			const parsed = URI.parse(inside);
			if (parsed.error) {
				diags.push(
					Diagnostic.create(
						range,
						`Invalid IRI syntax: ${parsed.error}`,
						DiagnosticSeverity.Warning, 
						'RDFusion'
					)
				);
				continue;
			}

			const scheme = (parsed.scheme ?? '').toLowerCase();
			if (scheme) {
				if (cfg.strictSchemeCheck) {
				const allowed = new Set(
					cfg.customIriScheme.split(',').map((s: string) => s.trim())
				);
				if (!allowed.has(scheme)) {
					diags.push(
						Diagnostic.create(
							range,
							`Scheme "${scheme}:" not in custom allowed list.`,
							DiagnosticSeverity.Warning, 
							'RDFusion'
						)
					);
				}
				} else {
					if (!iana.has(scheme)) {
						diags.push(
							Diagnostic.create(
								range,
								`Scheme "${scheme}:" not registered with IANA.`,
								DiagnosticSeverity.Warning, 
								'RDFusion'
							)
						);
					}
				}
			} else if (!(baseInfo && startOffset > baseInfo.offset)) {
				diags.push(
					Diagnostic.create(
						range,
						`Relative IRI "<${inside}>" used without @base."`,
						DiagnosticSeverity.Warning, 
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
