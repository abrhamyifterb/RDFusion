import { LRUCache } from 'lru-cache';

export class Cache {
	private prefixes = new LRUCache<string, string>({
		max: 3500,
		ttl: 86_400_000,
		ttlAutopurge: true,   
		updateAgeOnGet: true,
	});

	get(key: string)  { return this.prefixes.get(key); }
	set(key: string, value: string) { this.prefixes.set(key, value); }
	getAll() {
		const out: { prefix: string; iri: string }[] = [];
		for (const [k, v] of this.prefixes.entries()) out.push({ prefix: k, iri: v });
		return out;
	}
}
