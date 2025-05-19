import {LRUCache} from 'lru-cache';

export class Cache<K extends string, V extends object> {
	private lru: LRUCache<K, V>;
	
	constructor(maxEntries = 100) {
		this.lru = new LRUCache<K, V>({
		max: maxEntries
		});
	}
	
	get(key: K): V | undefined {
		return this.lru.get(key);
	}
	
	set(key: K, value: V): void {
		this.lru.set(key, value);
	}
	
	clear(key?: K): void {
		if (key !== undefined) {
		this.lru.delete(key);
		} else {
		this.lru.clear();
		}
	}
}
