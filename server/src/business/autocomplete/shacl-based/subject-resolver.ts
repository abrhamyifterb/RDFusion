import {
	TextDocumentPositionParams,
	TextDocuments
  } from 'vscode-languageserver';
  import { TextDocument } from 'vscode-languageserver-textdocument';
  import { DataManager }  from '../../../data/data-manager';
  import { ParsedGraph }  from '../../../data/irdf-parser';
  
  export interface ResolvedSubject {
	iri:          string;
	tokenOffset:  number;
	tokenLength:  number;
  }
  
  export class SubjectResolver {
	static resolve(
	  params: TextDocumentPositionParams,
	  docs:   TextDocuments<TextDocument>,
	  dataMgr: DataManager
	): ResolvedSubject | null {
		const uri    = params.textDocument.uri;
		const doc    = docs.get(uri);
		const parsed = dataMgr.getParsedData(uri) as ParsedGraph | undefined;
		if (!doc || !parsed) {return null;}
	
		const { tokens, quads, prefixes } = parsed;
		const cursorOff = doc.offsetAt(params.position);
	
		const before = tokens.filter(t => t.endOffset <= cursorOff);
	
		let lastDotIdx = -1;
		for (let i = before.length - 1; i >= 0; i--) {
			if (before[i].image === '.') {
				lastDotIdx = i;
				break;
			}
		}
		// console.log('[SHACL·Resolver] lastDotIdx =', lastDotIdx, 'token:', lastDotIdx >= 0 ? before[lastDotIdx].image : 'none');
	
		const startIdx = lastDotIdx + 1;
		for (let i = startIdx; i < before.length; i++) {
			const t = before[i];
			let iri: string | undefined;
	
			if (t.type === 'IRIREF') {
				iri = t.image.slice(1, -1);
			} else if (t.type === 'PNAME_LN') {
				const [pfx, local] = t.image.split(':', 2);
				const base = prefixes?.[pfx];
				if (base) {
					iri = base + local;
				}
			}
	
			if (iri && quads.some(q => q.subject.value === iri)) {
			// console.log('[SHACL·Resolver] matched subject token', t.image, iri, `[${t.startOffset},${t.endOffset})`);
			return {
				iri,
				tokenOffset: t.startOffset,
				tokenLength: t.endOffset - t.startOffset
			};
			}
		}
	
		// console.log('[SHACL·Resolver] no matching subject after last dot');
		return null;
	}
}
