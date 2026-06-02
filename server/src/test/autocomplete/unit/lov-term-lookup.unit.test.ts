import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
}));

vi.mock('node-fetch', () => ({
	default: mocks.fetch,
}));

import { LOV_CACHE_TTL_MS, LOV_NEGATIVE_CACHE_TTL_MS, LovTermLookup } from '../../../business/autocomplete/term-completion/lov-term-lookup';

describe('LovTermLookup', () => {
	beforeEach(() => {
		mocks.fetch.mockReset();
	});

	it('returns local names from LOV autocomplete results and caches by query', async () => {
		mocks.fetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				results: [
					{ localName: ['prefLabel'] },
					{ localName: 'altLabel' },
					{ localName: undefined },
				],
			}),
		});

		const lookup = new LovTermLookup();
		const first = await lookup.getTerms('skos:la');
		const second = await lookup.getTerms('skos:la');

		expect(first).toEqual(new Set(['prefLabel', 'altLabel']));
		expect(second).toEqual(first);
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
		expect(mocks.fetch.mock.calls[0][0]).toContain('q=skos%3Ala');
	});


	it('keeps successful LOV autocomplete results fresh for 24 hours', async () => {
		mocks.fetch.mockResolvedValue({
			ok: true,
			json: async () => ({ results: [{ localName: 'prefLabel' }] }),
		});

		const lookup = new LovTermLookup();
		await lookup.getTerms('skos:pref');

		const remainingTtl = (lookup as any).queryCache.getRemainingTTL('skos:pref');
		expect(LOV_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
		expect(remainingTtl).toBeGreaterThan(LOV_CACHE_TTL_MS - 1000);
	});

	it('keeps failed LOV autocomplete results on the shorter negative cache TTL', async () => {
		mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

		const lookup = new LovTermLookup();
		await lookup.getTerms('skos:missing-ttl');

		const remainingTtl = (lookup as any).queryCache.getRemainingTTL('skos:missing-ttl');
		expect(LOV_NEGATIVE_CACHE_TTL_MS).toBe(10 * 60 * 1000);
		expect(remainingTtl).toBeGreaterThan(LOV_NEGATIVE_CACHE_TTL_MS - 1000);
		expect(remainingTtl).toBeLessThanOrEqual(LOV_NEGATIVE_CACHE_TTL_MS);
	});

	it('returns and caches an empty set for failed LOV responses', async () => {
		mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });

		const lookup = new LovTermLookup();
		const first = await lookup.getTerms('skos:missing');
		const second = await lookup.getTerms('skos:missing');

		expect(first.size).toBe(0);
		expect(second.size).toBe(0);
		expect(mocks.fetch).toHaveBeenCalledTimes(1);
	});
});
