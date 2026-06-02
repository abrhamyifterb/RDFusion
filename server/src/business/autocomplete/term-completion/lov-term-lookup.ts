/* eslint-disable @typescript-eslint/no-explicit-any */
import { LRUCache } from 'lru-cache';
import fetch from 'node-fetch';
import { withTimeout } from './remote-vocabulary-fetcher';

const LOV_FETCH_TIMEOUT_MS = 3000;
export const LOV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LOV_NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Short-lived LOV autocomplete lookup used only for completion assistance.
 * Results from this service are intentionally not treated as authoritative
 * remote vocabulary data for validation; the namespace vocabulary cache remains
 * the validation source of truth.
 */
export class LovTermLookup {
	private readonly queryCache = new LRUCache<string, Set<string>>({ max: 200, ttl: LOV_CACHE_TTL_MS });

	public async getTerms(query: string): Promise<Set<string>> {
		const cached = this.queryCache.get(query);
		if (cached) return cached;

		try {
			const terms = await this.fetchTerms(query);
			this.queryCache.set(query, terms, { ttl: terms.size ? LOV_CACHE_TTL_MS : LOV_NEGATIVE_CACHE_TTL_MS });
			return terms;
		} catch {
			const empty = new Set<string>();
			this.queryCache.set(query, empty, { ttl: LOV_NEGATIVE_CACHE_TTL_MS });
			return empty;
		}
	}

	private async fetchTerms(query: string): Promise<Set<string>> {
		const url = `https://lov.linkeddata.es/dataset/lov/api/v2/term/autocomplete?q=${encodeURIComponent(query)}`;
		const response = await withTimeout(fetch(url), LOV_FETCH_TIMEOUT_MS, `LOV autocomplete ${query}`);
		if (!response.ok) {
			return new Set<string>();
		}

		const data = (await response.json() as any);
		return new Set<string>(
			(data?.results ?? [])
				.map((result: any) => Array.isArray(result?.localName) ? result.localName[0] : result?.localName)
				.filter((term: unknown): term is string => typeof term === 'string' && term.length > 0),
		);
	}
}
