/* eslint-disable curly */
import { ucharEscape } from './uchar';

export function escapeStringBody(
	decoded: string,
	quote: '"' | "'",
	escapeAllUnicode: boolean
	): string {
	const out: string[] = [];

	for (let i = 0; i < decoded.length; i++) {
		const cp = decoded.codePointAt(i)!;
		const ch = String.fromCodePoint(cp);
		if (cp > 0xffff) i++;

		if (ch === '\\') { out.push('\\\\'); continue; }
		if (ch === quote) { out.push(`\\${quote}`); continue; }

		switch (ch) {
		case '\t': out.push('\\t'); continue;
		case '\b': out.push('\\b'); continue;
		case '\n': out.push('\\n'); continue;
		case '\r': out.push('\\r'); continue;
		case '\f': out.push('\\f'); continue;
		}

		if (cp < 0x20 || cp === 0x7f) { out.push(ucharEscape(cp)); continue; }
		if (escapeAllUnicode && cp > 0x7e) { out.push(ucharEscape(cp)); continue; }

		out.push(ch);
	}

	return out.join('');
}
