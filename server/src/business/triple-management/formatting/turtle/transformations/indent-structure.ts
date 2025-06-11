/* eslint-disable @typescript-eslint/no-explicit-any */

export function indentStructure(lines: string[], cfg: any): string[] {
	const out: string[] = [];
	let insideBlock = false;

	for (const raw of lines) {
		const line = raw; 
		const trimmed = line.trim();
	
		if (trimmed === '' || trimmed.startsWith('@prefix')) {
			out.push(line);
			insideBlock = false;
			continue;
		}
	
		if (!insideBlock) {
			out.push(line);
			insideBlock = true;
			continue;
		}
	
		out.push(' '.repeat(cfg.indentSize) + trimmed);
	}
	
	return out;
}