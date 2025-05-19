/* eslint-disable @typescript-eslint/no-explicit-any */
import fetch, { Response } from 'node-fetch';
import { IFetcher } from './ifetcher';

export class Fetcher implements IFetcher {
	public async getPrefixes<T>(url: string): Promise<T> {
		const res: Response = await fetch(url, {
			headers: {
				'Accept': 'application/json'
			}
        });

		if (!res.ok) {
			throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
		}

		const data: any = await res.json();
		return data;
	}
}
