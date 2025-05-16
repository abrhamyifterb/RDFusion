import { Node } from 'jsonc-parser';
import { Range } from 'vscode-languageserver';
import { computeLineColumn } from '../../../../data/compute-line-column.js';

export function nodeToRange(text: string, node: Node): Range {
	const start = computeLineColumn(text, node?.offset);
	const end   = computeLineColumn(text, node?.offset + node?.length);
	return Range.create(start, end);
}

export function nodeText(text: string, node: Node): string {
	return text.slice(node?.offset, node?.offset + node?.length);
}

export function walkAst(node: Node, fn: (n: Node) => void): void {
	fn(node);
	node?.children?.forEach(c => walkAst(c, fn));
}
