import { sortLinesUnique } from './canonize';

export function extractBnodeIds(nq: string): Set<string> {
	const ids = new Set<string>();
	for (const line of nq.split(/\r?\n/)) {
		if (!line) {continue;}
		line.replace(/(_:[A-Za-z0-9]+)\b/g, (_, id) => { ids.add(id); return id; });
	}
	return ids;
	}

	export function buildOneHopSignatures(nq: string, ids: Set<string>): Map<string, string> {
	const lines = nq.split(/\r?\n/).filter(Boolean);
	const masked = lines.map(l => l.replace(/_:[A-Za-z0-9]+/g, '_:*'));
	const map = new Map<string, string>();
	for (const id of ids) {
		const sigs: string[] = [];
		for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(id)) {
			sigs.push(masked[i].replace(new RegExp(id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), '?X'));
		}
		}
		sigs.sort(); map.set(id, sigs.join('\n'));
	}
	return map;
	}

	export function alignRightToLeftBySignature(leftCanon: string, rightCanon: string): string {
	const Lids = extractBnodeIds(leftCanon);
	const Rids = extractBnodeIds(rightCanon);
	if (!Lids.size || !Rids.size) {return rightCanon;}

	const Lsig = buildOneHopSignatures(leftCanon, Lids);
	const Rsig = buildOneHopSignatures(rightCanon, Rids);

	const Lb = new Map<string, string[]>(), Rb = new Map<string, string[]>();
	for (const [id, s] of Lsig) { const a = Lb.get(s) ?? []; a.push(id); Lb.set(s, a); }
	for (const [id, s] of Rsig) { const a = Rb.get(s) ?? []; a.push(id); Rb.set(s, a); }

	const map = new Map<string, string>();
	for (const [sig, rIds] of Rb) {
		const lIds = Lb.get(sig);
		if (!lIds?.length) {continue;}
		rIds.sort(); lIds.sort();
		const n = Math.min(rIds.length, lIds.length);
		for (let i = 0; i < n; i++) {map.set(rIds[i], lIds[i]);}
	}

	if (!map.size) {return rightCanon;}

	let out = rightCanon;
	const ordered = [...map.entries()].sort((a, b) => b[0].length - a[0].length);
	for (const [r, l] of ordered) {
		const re = new RegExp(r.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'g');
		out = out.replace(re, l);
	}
	return sortLinesUnique(out);
}
