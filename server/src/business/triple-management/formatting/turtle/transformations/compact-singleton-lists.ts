/* eslint-disable @typescript-eslint/no-explicit-any */
export function compactSingletonLists(lines: string[], cfg: any): string[] {
	if (!cfg.compactSingletonLists) { return lines; }

	return lines.map(l => l.replace(/\(\s*([^\s()]+)\s*\)/g, '($1)'));
}