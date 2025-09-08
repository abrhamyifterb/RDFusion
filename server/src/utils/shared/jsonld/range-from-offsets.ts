import { Range } from 'vscode-languageserver';
import { computeLineColumn } from '../../../data/compute-line-column';

export function rangeFromOffsets(
	text: string,
	start: number,
	end: number
): Range {
	const startPos = computeLineColumn(text, start);
	const endPos   = computeLineColumn(text, end);
	return Range.create(startPos, endPos);
}