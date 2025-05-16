import { LRUCache } from 'lru-cache';

export class Cache {
	private prefixes = new LRUCache<string, string>({ max: 200, ttl: 3600_000 });

	get(key: string): string | undefined { 
		return this.prefixes.get(key); 
	}

	set(key: string, value: string) { 
		this.prefixes.set(key, value); 
	}

	has(key: string): boolean { 
		return this.prefixes.has(key); 
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getAll(): any {
		const entries: { prefix: string, iri: string }[] = [];
		this.prefixes.forEach((value, key) => {
			entries.push({ prefix: key, iri: value });
		});
		return entries;
	}
}
