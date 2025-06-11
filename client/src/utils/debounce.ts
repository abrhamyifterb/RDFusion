/* eslint-disable @typescript-eslint/no-explicit-any */
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 500): T {
	let timeout: NodeJS.Timeout;
	return function (this: any, ...args: Parameters<T>) {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => fn.apply(this, args), wait);
	} as T;
}
