export interface PrefixFetchOptions {
	timeoutMs?: number;
}

export interface IFetcher {
	getPrefixes<T>(url: string, options?: PrefixFetchOptions): Promise<T>;
}
