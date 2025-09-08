import { Node } from 'jsonc-parser';
import { Range } from 'vscode-languageserver';
import { Extractor } from '../../utils/shared/jsonld/iextractor';
import { childAt } from '../../utils/shared/jsonld/child-at';
import { rangeFromOffsets } from '../../utils/shared/jsonld/range-from-offsets';

export class IdRangeBuilder implements Extractor<Map<string,Range>> {
	constructor(private context: Map<string,string>) {}

	extract(ast: Node, text: string): Map<string,Range> {
		const map = new Map<string,Range>();
		const walk = (node: Node, ancestors: Node[]) => {
		if (node?.type === 'property') {
			const key = childAt(node, 0);
			const val = childAt(node, 1);
			if (
			key && val &&
			text.slice(key.offset, key.offset+key.length).replace(/"/g, '') === '@id' &&
			this.inGraph(ancestors, text)
			) {
			const raw = text.slice(val.offset+1, val.offset+val.length-1);
			const [pfx, loc] = raw.split(':',2);
			let base = this.context.get(pfx) ?? pfx;
			if (base.endsWith('/')) {base = base.slice(0,-1);}
			let full: string;
			try { full = new URL(`${base}/${loc}`).toString(); }
			catch { full = raw; }
			map.set(full, rangeFromOffsets(text, key.offset, key.offset+key.length));
			}
		}
		node.children?.forEach(c => walk(c, [node, ...ancestors]));
		};
		walk(ast, []);
		return map;
	}

	private inGraph(anc: Node[], text: string): boolean {
		if (anc.length < 3) {return false;}
		const [o,a,p] = anc;
		if (o?.type !== 'object' || a?.type !== 'array' || p?.type !== 'property') {return false;}
		const key = childAt(p,0);
		return !!key && text.slice(key.offset, key.offset+key.length) === '"@graph"';
	}
}