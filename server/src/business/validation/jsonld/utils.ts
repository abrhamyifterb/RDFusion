import { Node } from "jsonc-parser"; 
import { Range } from "vscode-languageserver/node.js";
import { computeLineColumn } from '../../../data/compute-line-column.js';

export function extractContextMap(root: Node | undefined, input: string): Map<string,string> {
	const map = new Map<string,string>();
	for (const prop of root?.children ?? []) {
		const key = prop.children?.[0];
		const val = prop.children?.[1];
		if (key && input.slice(key.offset, key.offset + key.length) === '"@context"' && val?.type === "object") {
		for (const e of val.children ?? []) {
			const [kNode, vNode] = e.children!;
			const term = input.slice(kNode.offset, kNode.offset + kNode.length).replace(/"/g,"");
			let iri  = input.slice(vNode.offset, vNode.offset + vNode.length).replace(/^"|"$/g,"");
			if (iri.endsWith("/")) iri = iri.slice(0,-1);
			map.set(term, iri);
		}
		}
	}
	return map;
}

export function extractDefinitionIds(
	root: Node | undefined,
	input: string
): { id: string; range: Range }[] {
	const defs: { id: string; range: Range }[] = [];
	const graphArr = root?.children?.find(prop =>
		input.slice(prop.children![0].offset, prop.children![0].offset + prop.children![0].length) === '"@graph"'
	)?.children?.[1];

	if (!graphArr || graphArr.type !== "array") return defs;

	for (const elem of graphArr.children ?? []) {
		if (elem.type !== "object") continue;
		for (const prop of elem.children ?? []) {
			const [kNode, vNode] = prop.children!;
			if (input.slice(kNode.offset, kNode.offset + kNode.length) === '"@id"') {
				const raw = input.slice(vNode.offset, vNode.offset + vNode.length).replace(/^"|"$/g,"");
				const start = computeLineColumn(input, vNode.offset);
				const end   = computeLineColumn(input, vNode.offset + vNode.length);
				defs.push({ id: raw, range: Range.create(start, end) });
				break;
			}
		}
	}
	return defs;
}
