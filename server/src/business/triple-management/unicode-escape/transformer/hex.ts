function isHex(ch: string): boolean {
	const c = ch.charCodeAt(0);
	return (
		(c >= 48 && c <= 57) ||
		(c >= 65 && c <= 70) || 
		(c >= 97 && c <= 102)
	);
}

export function readHex(s: string, start: number, len: number): number | null {
	if (start + len > s.length) {return null;}
	for (let i = 0; i < len; i++) {
		if (!isHex(s[start + i])) {return null;}
	}
	return parseInt(s.slice(start, start + len), 16);
}

export function hexUpper(n: number, width: number): string {
	return n.toString(16).toUpperCase().padStart(width, '0');
}
