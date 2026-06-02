/* eslint-disable @typescript-eslint/no-explicit-any */
import fetch, { Response } from 'node-fetch';
import { IFetcher, PrefixFetchOptions } from './ifetcher';

export const DEFAULT_PREFIX_FETCH_TIMEOUT_MS = 5000;

export class Fetcher implements IFetcher {
	public async getPrefixes<T>(url: string, options: PrefixFetchOptions = {}): Promise<T> {
		const timeoutMs = options.timeoutMs ?? DEFAULT_PREFIX_FETCH_TIMEOUT_MS;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const res: Response = await fetch(url, {
				headers: {
					'Accept': 'application/json'
				},
				signal: controller.signal,
			});

			if (!res.ok) {
				throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
			}

			const data: any = await res.json();
			return data;
		} catch (error: any) {
			if (error?.name === 'AbortError') {
				throw new Error(`Fetching ${url} timed out after ${timeoutMs}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}
}
