/* eslint-disable @typescript-eslint/no-explicit-any */

export function indentBrackets(lines: string[], cfg: any): string[] {
	const out: string[] = [];
	let depth = 0;

	for (const raw of lines) {
		const trimmed = raw.trim();

		if (trimmed.endsWith('[')) {
			if (depth === 0) {
				out.push(raw);
			} else {
				const indent = ' '.repeat((depth + 1) * cfg.indentSize);
				out.push(indent + trimmed);
			}
			depth++;
			continue;
		}
		if (trimmed.startsWith(']')) {
			const indent = ' '.repeat(depth * cfg.indentSize);
			out.push(indent + trimmed);
			depth = Math.max(0, depth - 1);
			continue;
		}
	
		if (depth > 0) {
			const indent = ' '.repeat((depth + 1) * cfg.indentSize);
			out.push(indent + trimmed);
			continue;
		}
		out.push(raw);
	}

	return out;
}