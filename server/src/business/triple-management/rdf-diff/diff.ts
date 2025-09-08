export function setDiff(left: string, right: string): { adds: string[]; dels: string[] } {
	const L = new Set(left.split(/\r?\n/).filter(Boolean));
	const R = new Set(right.split(/\r?\n/).filter(Boolean));
	const adds: string[] = [], dels: string[] = [];
	for (const l of L) {
		if (!R.has(l)) dels.push(l);
	}
	for (const r of R) {
		if (!L.has(r)) adds.push(r);
	}
	adds.sort(); dels.sort();
	return { adds, dels };
}
