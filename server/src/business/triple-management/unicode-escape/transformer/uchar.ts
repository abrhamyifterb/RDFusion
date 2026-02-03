import { readHex, hexUpper } from './hex';

export function ucharEscape(cp: number): string {
	return cp <= 0xffff ? `\\u${hexUpper(cp, 4)}` : `\\U${hexUpper(cp, 8)}`;
}

export function tryReadUCharEscape(
	input: string,
	backslashIndex: number
): { raw: string; cp: number; len: number } | null {
	if (backslashIndex + 1 >= input.length) {return null;}

	const nxt = input[backslashIndex + 1];
	if (nxt === 'u') {
		const cp = readHex(input, backslashIndex + 2, 4);
		if (cp === null) {return null;}
		return { raw: input.slice(backslashIndex, backslashIndex + 6), cp, len: 6 };
	}

	if (nxt === 'U') {
		const cp = readHex(input, backslashIndex + 2, 8);
		if (cp === null) {return null;}
		return { raw: input.slice(backslashIndex, backslashIndex + 10), cp, len: 10 };
	}

	return null;
}
