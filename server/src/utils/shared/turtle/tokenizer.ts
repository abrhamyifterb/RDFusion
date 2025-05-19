/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Token {
	type:        string;
	image:       string;
	startLine:   number; 
	startColumn: number;
	endLine?:    number; 
	endColumn?:  number;
}

export function buildPrefixMapping(tokens: Token[]): Record<string,string> {
	const m: Record<string,string> = {};
	for (let i = 0; i+2 < tokens.length; i++) {
		const [t1,t2,t3] = [tokens[i], tokens[i+1], tokens[i+2]];
		if (t1.type==='TTL_PREFIX' && t2.type==='PNAME_NS' && t3.type==='IRIREF') {
			const prefix = t2.image.replace(/:$/,'');
			const iri    = t3.image.replace(/^<|>$/g,'');
			m[prefix] = iri;
			i += 2;
		}
	}
	return m;
}
	
export function extractLiteralInfos(tokens: Token[], prefixMap: Record<string,string>) {
	const lits: {value: string; datatype?: string; language?: string; token: Token;}[] = [];
	
	for (let i=0; i<tokens.length; i++) {
		const t = tokens[i];
		if (['STRING_LITERAL_QUOTE','INTEGER','DECIMAL','FLOAT'].includes(t.type)) {
			const lit = { value: t.image, token: t as Token } as any;

			if (tokens[i+1]?.type==='DoubleCaret' && tokens[i+2]) {
				const dt = tokens[i+2].image;
				if (/^<.*>$/.test(dt)) lit.datatype = dt.slice(1,-1);
				else {
					const [pre,local] = dt.split(':');
					if (prefixMap[pre]) lit.datatype = prefixMap[pre] + local;
					else lit.datatype = dt;
				}
				i += 2;
			}
			else if (tokens[i+1]?.type==='LANGTAG') {
				lit.language = tokens[i+1].image.replace(/^@/,'');
				i += 1;
			}
			lits.push(lit);
		}
	}
	return lits;
}
