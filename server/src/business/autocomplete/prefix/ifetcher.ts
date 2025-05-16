export interface IFetcher {
	getPrefixes<T>(url: string): Promise<T>;
}
