import { decodeTurtleEscapes } from './decode';
import { escapeIriRefBody } from './encode-iri';
import { escapeStringBody } from './encode-string';


export function transformTurtleTextUnicodeEscapes(text: string, mode: string): string {
	const escapeAllUnicode = mode === 'encode';

	const out: string[] = [];
	const n = text.length;

	const transformIri = (inner: string) => {
		const decoded = decodeTurtleEscapes(inner, 'iri');
		return escapeIriRefBody(decoded, escapeAllUnicode);
	};

	const transformStr = (inner: string, quote: '"' | "'") => {
		const decoded = decodeTurtleEscapes(inner, 'string');
		return escapeStringBody(decoded, quote, escapeAllUnicode);
	};

	for (let i = 0; i < n; i++) {
		const ch = text[i];

		if (ch === '#') {
		const start = i;
		while (i < n && text[i] !== '\n') {i++;}
		out.push(text.slice(start, i));
		if (i < n) {out.push('\n');}
		continue;
		}

		// IRIREF: < ... >
		if (ch === '<') {
		const start = i;
		i++; // past '<'

		let inner = '';
		while (i < n) {
			const c = text[i];
			if (c === '\\' && i + 1 < n) {
				inner += c + text[i + 1];
				i += 2;
				continue;
			}
			if (c === '>') {break;}
			inner += c;
			i++;
		}

		// Unterminated IRIREF
		if (i >= n || text[i] !== '>') {
			out.push(text.slice(start));
			break;
		}

		out.push('<', transformIri(inner), '>');
		continue;
		}

		if (ch === '"' || ch === "'") {
		const quote = ch as '"' | "'";
		const isLong = i + 2 < n && text[i + 1] === quote && text[i + 2] === quote;
		const delimLen = isLong ? 3 : 1;

		out.push(text.slice(i, i + delimLen));
		i += delimLen;

		let inner = '';
		while (i < n) {
			const c = text[i];

			if (c === '\\' && i + 1 < n) {
			inner += c + text[i + 1];
			i += 2;
			continue;
			}

			if (!isLong) {
			if (c === quote) {break;}
			inner += c;
			i++;
			continue;
			}

			if (c === quote && i + 2 < n && text[i + 1] === quote && text[i + 2] === quote) {break;}

			inner += c;
			i++;
		}

		if (i >= n) {
			out.push(inner);
			break;
		}

		out.push(transformStr(inner, quote));
		out.push(text.slice(i, i + delimLen));
		i += delimLen - 1;
		continue;
		}

		out.push(ch);
	}

	return out.join('');
}
