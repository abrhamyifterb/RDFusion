import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
}));

vi.mock('node-fetch', () => ({
	default: mocks.fetch,
}));

import { DEFAULT_PREFIX_FETCH_TIMEOUT_MS, Fetcher } from '../../../business/autocomplete/prefix/fetcher';

describe('Fetcher', () => {
	beforeEach(() => {
		mocks.fetch.mockReset();
	});

	it('fetches prefix JSON with an abort signal and default timeout support', async () => {
		mocks.fetch.mockResolvedValue({
			ok: true,
			json: async () => ({ ex: 'http://example.com/' }),
		});

		const fetcher = new Fetcher();
		await expect(fetcher.getPrefixes('https://prefix.cc/ex.file.json')).resolves.toEqual({ ex: 'http://example.com/' });

		expect(DEFAULT_PREFIX_FETCH_TIMEOUT_MS).toBe(5000);
		expect(mocks.fetch).toHaveBeenCalledWith(
			'https://prefix.cc/ex.file.json',
			expect.objectContaining({
				headers: { Accept: 'application/json' },
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it('aborts slow prefix.cc requests after the configured timeout', async () => {
		vi.useFakeTimers();
		try {
			mocks.fetch.mockImplementation((_url: string, init: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => {
					const error = new Error('aborted');
					error.name = 'AbortError';
					reject(error);
				});
			}));

			const fetcher = new Fetcher();
			const promise = fetcher.getPrefixes('https://prefix.cc/slow.file.json', { timeoutMs: 25 });

			vi.advanceTimersByTime(25);

			await expect(promise).rejects.toThrow('Fetching https://prefix.cc/slow.file.json timed out after 25ms');
		} finally {
			vi.useRealTimers();
		}
	});
});
