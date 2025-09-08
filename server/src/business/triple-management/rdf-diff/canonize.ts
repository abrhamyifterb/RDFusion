/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Connection } from 'vscode-languageserver/node';

let canonizeFn: ((input: string, opts: any) => Promise<string>) | null = null;

async function loadCanonize(connection: Connection) {
	if (canonizeFn) {return canonizeFn;}
	const mod: any = await import('rdf-canonize').catch((e: any) => {
		connection.console.error(`[URDNA] failed to load rdf-canonize: ${e?.message || e}`);
		throw e;
	});
	const fn = mod?.canonize ?? mod?.default?.canonize ?? mod?.default;
	if (typeof fn !== 'function') {
		const msg = 'canonize function not found in rdf-canonize export';
		console.error(`[URDNA] ${msg}`);
		throw new Error(msg);
	}
	canonizeFn = fn;
	return canonizeFn!;
}

export function inputHasBNodes(nq: string): boolean {
	return /_:[A-Za-z0-9]+/.test(nq);
}
export function labelsAreCanonical(nq: string): boolean {
	const all = nq.match(/_:[A-Za-z0-9]+/g) ?? [];
	return all.length === 0 || all.every(id => /^_:c14n[0-9]+$/.test(id));
}

export async function canonURDNA2015(nq: string, connection: Connection): Promise<string> {
	if (!nq || !nq.trim()) {return '';}
	const canonize = await loadCanonize(connection);
	const canon = await canonize(nq, { algorithm: 'URDNA2015', inputFormat: 'application/n-quads' });
	const out = sortLinesUnique(canon);
	if (inputHasBNodes(nq) && !labelsAreCanonical(out)) {
		connection.console.error('[URDNA] canonize returned non-c14n labels; check bundling/import.');
	}
	return out;
}

export function sortLinesUnique(nq: string): string {
	const arr = nq.split(/\r?\n/).filter(Boolean);
	arr.sort();
	return arr.length ? arr.join('\n') + '\n' : '';
}
