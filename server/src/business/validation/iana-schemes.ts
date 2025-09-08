import fetch from 'node-fetch';
import { LRUCache } from 'lru-cache';

const CACHE_KEY = 'iana-schemes';
const ianaCache = new LRUCache<string, Set<string>>({max: 1, ttl: 1000 * 60 * 60 * 24 });
const URL = 'https://www.iana.org/assignments/uri-schemes/uri-schemes-1.csv';

export async function getIanaSchemes(): Promise<Set<string>> {
	const cached = ianaCache.get(CACHE_KEY);

	if (cached) {
		return cached;
	}
	
	const response = await fetch(URL);
	if (!response.ok) {
		console.error(`Failed to fetch IANA CSV (${response.status})`);
	}
	const csvText = await response.text();
	const schemes = csvText
		.split('\n')
		.slice(1)
		.map(line => line.split(',')[0].trim())
		.filter(s => !!s);

	const schemeSet = new Set(schemes);

	ianaCache.set(CACHE_KEY, schemeSet);
	return schemeSet;
}
