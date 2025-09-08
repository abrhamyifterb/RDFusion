import { Node } from 'jsonc-parser';
import { Extractor } from '../../../utils/shared/jsonld/iextractor';
import { Definition } from '../../irdf-parser';
import { childAt } from '../../../utils/shared/jsonld/child-at';
import { rangeFromOffsets } from '../../../utils/shared/jsonld/range-from-offsets';

export class DefinitionExtractor implements Extractor<Definition[]> {
	extract(ast: Node, text: string): Definition[] {
		let graphNode: Node | undefined;
		const defs: Definition[] = [];

		const findGraph = (n: Node): void => {
			if (n?.type === 'property') {
				const key = childAt(n, 0);
				const val = childAt(n, 1);
				if (
					key && val &&
					text.slice(key.offset, key.offset + key.length) === '"@graph"' &&
					val?.type === 'array'
				) {
					graphNode = val;
				}
			}
		n.children?.forEach(findGraph);
		};
		findGraph(ast);
		if (!graphNode) {return defs;}

		graphNode.children?.forEach(item => {
		if (item?.type !== 'object') {return;}
		let idNode: Node | undefined;
		let typeNode: Node | undefined;

		item.children?.forEach(prop => {
			const key = childAt(prop, 0);
			const val = childAt(prop, 1);
			if (!key || !val) {return;}
			const keyText = text.slice(key.offset, key.offset + key.length);
			if (keyText === '"@id"') {idNode = val;}
			if (keyText === '"@type"') {typeNode = val;}
		});

		if (idNode) {
			const idVal = text.slice(idNode?.offset + 1, idNode?.offset + idNode.length - 1);
			const def: Definition = {
			id: idVal,
			range: rangeFromOffsets(text, idNode?.offset, idNode?.offset + idNode.length)
			};
			if (typeNode) {
				def.typeIri = text.slice(typeNode?.offset + 1, typeNode?.offset + typeNode.length - 1);
				def.typeRange = rangeFromOffsets(text, typeNode?.offset, typeNode?.offset + typeNode.length);
			}
			defs.push(def);
		}
		});

		return defs;
	}
}