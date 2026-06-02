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
		const parsed = dataMgr.getGraphSnapshot(uri) as ParsedGraph | undefined;
		if (!doc || !parsed) {return null;}
	
		const { tokens, quads, prefixes } = parsed;
		const cursorOff = doc.offsetAt(params.position);
		const subjects = new Set(quads.map(q => q.subject.value));
	
		let lastDotIdx = -1;
		for (let i = tokens.length - 1; i >= 0; i--) {
			const token = tokens[i];
			if (token.endOffset > cursorOff) {continue;}
			if (token.image === '.') {
				lastDotIdx = i;
				break;
			}
		}
	
		const startIdx = lastDotIdx + 1;
		for (let i = startIdx; i < tokens.length; i++) {
			const t = tokens[i];
			if (t.endOffset > cursorOff) {break;}
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
	
			if (iri && subjects.has(iri)) {
				return {
					iri,
					tokenOffset: t.startOffset,
					tokenLength: t.endOffset - t.startOffset
				};
			}
		}
	
		return null;
	}
}
