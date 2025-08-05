export function splitTopLevel(str: string, sep: string): string[] {
	const parts: string[] = [];
	let buf = '';
	let depthP = 0;
	let depthB = 0;
	let inString = false;
	let stringDelim = '';
	let prevChar = '';

	for (const ch of str) {
		if ((ch === '"' || ch === "'") && prevChar !== '\\') {
			if (!inString) {
				inString = true;
				stringDelim = ch;
			} else if (ch === stringDelim) {
				inString = false;
			}
		}
		console.log(inString);
		if (!inString) {
			if (ch === '(') {depthP++;}
			else if (ch === ')') {depthP--;}
			else if (ch === '[') {depthB++;}
			else if (ch === ']') {depthB--;}
		}
	
		if (ch === sep && depthP === 0 && depthB === 0 && !inString) {
			parts.push(buf.trim());
			buf = '';
		} else {
			buf += ch;
		}
	
		prevChar = ch;
	}

	if (buf.trim()) {parts.push(buf.trim());}
	return parts;
}
