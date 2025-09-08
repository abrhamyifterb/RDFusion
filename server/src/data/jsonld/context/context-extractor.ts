import { Node } from 'jsonc-parser';
import { Extractor } from '../../../utils/shared/jsonld/iextractor';
import { childAt } from '../../../utils/shared/jsonld/child-at';

export class ContextExtractor implements Extractor<Map<string,string>> {
	extract(ast: Node, text: string): Map<string,string> {
		const map = new Map<string,string>();
		const walk = (n: Node) => {
		if (n?.type === 'property') {
			const key = childAt(n, 0);
			const val = childAt(n, 1);
			if (
			key && val &&
			text.slice(key.offset, key.offset + key.length) === '"@context"' &&
			val?.type === 'object'
			) {
			val.children?.forEach(entry => {
				const termNode = childAt(entry, 0);
				const uriNode  = childAt(entry, 1);
				if (!termNode || !uriNode) {return;}
				const term = text.slice(termNode?.offset+1, termNode?.offset+termNode.length-1);
				let iri   = text.slice(uriNode?.offset+1, uriNode?.offset+uriNode.length-1);
				if (iri.endsWith('/')) {iri = iri.slice(0,-1);}
				map.set(term, iri);
			});
			}
		}
		n.children?.forEach(walk);
		};
		walk(ast);
		return map;
	}
}