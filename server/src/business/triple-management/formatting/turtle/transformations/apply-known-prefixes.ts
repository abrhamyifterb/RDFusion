/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrefixRegistry } from '../../../../autocomplete/prefix/prefix-registry';

export function applyKnownPrefixes(
	lines: string[],
	cfg: any,
	registry: PrefixRegistry
): string[] {
	if (!cfg.useKnownPrefixes) {return lines;}

	const prefixDecl = /^@prefix\s+([A-Za-z_][A-Za-z0-9_-]*):\s*<([^>]+)>\s*\./;
	const existing: Record<string,string> = {};
	const keep: string[] = [];
	for (const l of lines) {
		const m = prefixDecl.exec(l.trim());
		if (m) {existing[m[1]] = m[2];}
		else {keep.push(l);}
	}

	const merged = { ...existing };
	const newEntries: Record<string,string> = {};
	const registryEntries = registry.getAll();
	for (const { prefix, iri } of registryEntries) {
		if (merged[prefix] === iri) {continue;}
		if (prefix in merged) {continue;} 
		merged[prefix] = iri;
	}

	const iriRegex = /<([^>]+)>/g;
	const content = keep.map(line =>
		line.replace(iriRegex, (_, iri) => {
			for (const [p, u] of Object.entries(merged)) {
				if (iri.startsWith(u)) {
					const local = iri.slice(u.length);
					if (/^[A-Za-z_][A-Za-z0-9._-]*$/.test(local)) {
						newEntries[p] = u;
						return `${p}:${local}`;
					}
				}
			}
			return `<${iri}>`;
		})
	);
	const usedPrefixes = {...existing, ...newEntries};
	const decls = Object.entries(usedPrefixes)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([p, u]) => `@prefix ${p}: <${u}> .`);
	
	return [...decls, '', ...content];
}