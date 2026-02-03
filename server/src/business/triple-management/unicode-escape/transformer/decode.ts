
import { tryReadUCharEscape } from './uchar';

type TurtleEncodeTarget = 'iri' | 'string';

export function decodeTurtleEscapes(input: string, target: TurtleEncodeTarget): string {
	const out: string[] = [];

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (ch !== '\\') {
		out.push(ch);
		continue;
		}

		if (i === input.length - 1) {
		out.push('\\');
		break;
		}

		const u = tryReadUCharEscape(input, i);
		if (u) {
		const cp = u.cp;
		if (cp >= 0 && cp <= 0x10ffff) {
			try {
			out.push(String.fromCodePoint(cp));
			i += u.len - 1;
			continue;
			} catch {
			// 
			}
		}
		out.push(u.raw);
		i += u.len - 1;
		continue;
		}

		const nxt = input[i + 1];

		if (target === 'string') {
		switch (nxt) {
			case 't': out.push('\t'); i++; continue;
			case 'b': out.push('\b'); i++; continue;
			case 'n': out.push('\n'); i++; continue;
			case 'r': out.push('\r'); i++; continue;
			case 'f': out.push('\f'); i++; continue;
			case '"': out.push('"');  i++; continue;
			case "'": out.push("'");  i++; continue;
			case '\\': out.push('\\'); i++; continue;
			default:
			out.push('\\', nxt);
			i++;
			continue;
		}
		}

		// IRIs: preserve non-UCHAR escapes
		out.push('\\', nxt);
		i++;
	}

	return out.join('');
}
