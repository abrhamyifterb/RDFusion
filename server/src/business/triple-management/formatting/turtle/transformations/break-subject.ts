/* eslint-disable @typescript-eslint/no-explicit-any */

export function breakSubject(
	lines: string[],
	cfg: any
): string[] {
	if (!cfg.breakSubject) {return lines;}

	const out: string[] = [];
	
	const subjectRe = /^(\([^)]*\)|<[^>]*>|_:[^\s]+|\S+)\s+(.+)$/;

	for (const l of lines) {
		if (l.trim() === '' || l.startsWith('@prefix')) {
			out.push(l);
			continue;
		}
		const m = subjectRe.exec(l);
		if (m) {
			const subject = m[1];
			const rest    = m[2];
			out.push(subject);
			out.push(' '.repeat(cfg.indentSize) + rest);
		} else {
			out.push(l);
		}
	}
	return out;
}