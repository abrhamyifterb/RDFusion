import { ucharEscape } from './uchar';

function mustEscapeIriRefChar(cp: number, ch: string, escapeAllUnicode: boolean): boolean {
	if (cp <= 0x20 || cp === 0x7f) {return true;}

	if (
		ch === '<' || ch === '>' || ch === '"' ||
		ch === '{' || ch === '}' || ch === '|' ||
		ch === '^' || ch === '`' || ch === '\\'
	) {
		return true;
	}

	return escapeAllUnicode ? cp > 0x7e : false;
	}

	export function escapeIriRefBody(decoded: string, escapeAllUnicode: boolean): string {
	const out: string[] = [];

	for (let i = 0; i < decoded.length; i++) {
		const cp = decoded.codePointAt(i)!;
		const ch = String.fromCodePoint(cp);
		if (cp > 0xffff) {i++;}

		out.push(mustEscapeIriRefChar(cp, ch, escapeAllUnicode) ? ucharEscape(cp) : ch);
	}

	return out.join('');
}
