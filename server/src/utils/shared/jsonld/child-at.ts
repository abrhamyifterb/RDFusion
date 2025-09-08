import { Node } from 'jsonc-parser';

export function childAt(node: Node, index: number): Node | undefined {
	return Array.isArray(node.children) && node.children.length > index
		? node.children[index]
		: undefined;
}