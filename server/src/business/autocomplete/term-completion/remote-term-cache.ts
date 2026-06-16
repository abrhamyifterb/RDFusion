/* eslint-disable @typescript-eslint/no-explicit-any */
import { LRUCache } from 'lru-cache';
import { PrefixRegistry } from '../prefix/prefix-registry';
import { Connection } from 'vscode-languageserver';
import {
	freezeVocabularyInfo,
	mergeVocabularyInfos,
	type LocalTermVocabularyInfo,
} from '../term-metadata/vocabulary-info';
import { RemoteVocabularyParser } from './remote-vocabulary-parser';
import { RemoteVocabularyFetcher } from './remote-vocabulary-fetcher';
import { LovTermLookup } from './lov-term-lookup';
import { RemoteVocabularyHtmlFallback } from './remote-vocabulary-html-fallback';

const VOCAB_DEREFERENCE_TIMEOUT_MS = 8000;
const TERM_DEREFERENCE_TIMEOUT_MS = 5000;
export const REMOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
export const REMOTE_FETCH_NOTIFICATION_THROTTLE_MS = NEGATIVE_CACHE_TTL_MS;
const REMOTE_TERM_MISS = '__rdfusion_remote_term_miss__' as const;

type RemoteVocabularySource = 'remote' | 'empty';

export interface RemoteTermInfo {
	prefix: string;
	term: string;
	vocabulary: LocalTermVocabularyInfo;
}

interface RemoteVocabularySnapshot {
	namespaceIri: string;
	terms: Set<string>;
	infoByTerm: Map<string, RemoteTermInfo>;
	source: RemoteVocabularySource;
	fetchedAt: number;
}

interface RemoteFetchOptions {
	silent?: boolean;
}

export function normalizeNamespaceIri(namespaceIri: string): string {
	return namespaceIri.trim();
}


function emptySnapshot(namespaceIri: string): RemoteVocabularySnapshot {
	return {
		namespaceIri,
		terms: new Set<string>(),
		infoByTerm: new Map<string, RemoteTermInfo>(),
		source: 'empty',
		fetchedAt: Date.now(),
	};
}

function infoWithPrefix(info: RemoteTermInfo, prefix: string): RemoteTermInfo {
	return info.prefix === prefix ? info : { ...info, prefix };
}

function sourceForMerge(a?: RemoteVocabularySource, b?: RemoteVocabularySource): RemoteVocabularySource {
	return a === 'remote' || b === 'remote' ? 'remote' : 'empty';
}


export class RemoteTermCache {
	private vocabularyCache = new LRUCache<string, RemoteVocabularySnapshot | Promise<RemoteVocabularySnapshot>>({
		max: 100,
		ttl: REMOTE_CACHE_TTL_MS,
	});
	private exactTermLookupCache = new LRUCache<string, typeof REMOTE_TERM_MISS | Promise<RemoteTermInfo | undefined>>({
		max: 1000,
		ttl: REMOTE_CACHE_TTL_MS,
	});
	private readonly failureNotificationCache = new LRUCache<string, number>({
		max: 200,
	});
	private readonly parser: RemoteVocabularyParser;
	private readonly fetcher: RemoteVocabularyFetcher;
	private readonly lovLookup: LovTermLookup;
	private readonly htmlFallback: RemoteVocabularyHtmlFallback;

	constructor(
		private prefixRegistry: PrefixRegistry,
	) {
		this.parser = new RemoteVocabularyParser(prefixRegistry);
		this.fetcher = new RemoteVocabularyFetcher();
		this.lovLookup = new LovTermLookup();
		this.htmlFallback = new RemoteVocabularyHtmlFallback(prefixRegistry);
	}

	public async get(prefixQuery: string, connection: Connection, namespaceIri?: string, options: RemoteFetchOptions = {}): Promise<Set<string>> {
		const [prefix, fragment] = prefixQuery.split(':', 2);
		const iri = await this.resolveRegisteredNamespace(prefix, namespaceIri);

		if (!iri) {
			return new Set<string>();
		}

		const snapshot = await this.ensureVocabulary(prefix, iri);
		const allTerms = new Set(snapshot.terms);
		if (fragment) {
			const terms = await this.lovLookup.getTerms(prefixQuery);
			terms.forEach(t => allTerms.add(t));
		}

		if (allTerms.size < 1 && !options.silent) {
			this.showFetchFailureNotificationOnce(prefix, iri, connection);
		}
		return allTerms;
	}

	public getInfo(prefix: string, term: string, namespaceIri?: string): RemoteTermInfo | undefined {
		const baseIri = this.getRegisteredNamespace(prefix, namespaceIri);
		if (!baseIri) {return undefined;}

		const cached = this.getReadySnapshot(baseIri);
		return cached?.infoByTerm.get(term) ? infoWithPrefix(cached.infoByTerm.get(term)!, prefix) : undefined;
	}

	public getCachedTermsForPrefix(prefix: string, namespaceIri?: string): Set<string> | undefined {
		const baseIri = this.getRegisteredNamespace(prefix, namespaceIri);
		if (!baseIri) {return undefined;}

		const cached = this.getReadySnapshot(baseIri);
		return cached ? new Set(cached.terms) : undefined;
	}

	public async prefetchPrefix(prefix: string, connection: Connection, namespaceIri?: string, options: RemoteFetchOptions = {}): Promise<void> {
		try {
			await this.get(`${prefix}:`, connection, namespaceIri, { ...options, silent: true });
		} catch {
			// 
		}
	}

	public async ensureInfo(prefix: string, term: string, namespaceIri?: string): Promise<RemoteTermInfo | undefined> {
		const baseIri = await this.resolveRegisteredNamespace(prefix, namespaceIri);
		if (!baseIri) {return undefined;}

		const cached = this.getInfo(prefix, term, baseIri);
		if (cached && cached.vocabulary.roles.length > 0) {return cached;}

		const termIri = `${baseIri}${term}`;
		const vocabularyPromise = this.ensureVocabulary(prefix, baseIri).catch(() => emptySnapshot(baseIri));
		const exactPromise = this.ensureExactTerm(prefix, term, termIri, baseIri).catch(() => undefined);
		const [snapshot, exact] = await Promise.all([vocabularyPromise, exactPromise]);
		const fromVocabulary = snapshot.infoByTerm.get(term);
		let mergedVocabulary = mergeVocabularyInfos(fromVocabulary?.vocabulary, exact?.vocabulary);
		if (!mergedVocabulary) {
			const htmlVocabulary = await this.htmlFallback.fetchTerm({
				term,
				termIri,
				timeoutMs: TERM_DEREFERENCE_TIMEOUT_MS,
			}).catch(() => undefined);
			mergedVocabulary = mergeVocabularyInfos(htmlVocabulary);
		}
		if (!mergedVocabulary) {
			this.exactTermLookupCache.set(this.exactTermKey(baseIri, term), REMOTE_TERM_MISS, { ttl: NEGATIVE_CACHE_TTL_MS });
			return undefined;
		}

		const merged: RemoteTermInfo = { prefix, term, vocabulary: mergedVocabulary };
		this.exactTermLookupCache.delete(this.exactTermKey(baseIri, term));
		this.mergeTermIntoVocabulary(prefix, baseIri, term, merged);
		return merged;
	}

	private showFetchFailureNotificationOnce(prefix: string, namespaceIri: string, connection: Connection): void {
		const key = normalizeNamespaceIri(namespaceIri);
		const now = Date.now();
		const lastNotifiedAt = this.failureNotificationCache.get(key);
		if (lastNotifiedAt && now - lastNotifiedAt < REMOTE_FETCH_NOTIFICATION_THROTTLE_MS) {
			return;
		}

		this.failureNotificationCache.set(key, now);
		connection.window.showErrorMessage(`Unable to fetch remote vocabulary terms for prefix "${prefix}". The vocabulary may be unavailable or your network connection failed.`);
	}

	private getRegisteredNamespace(prefix: string, namespaceIri?: string): string | undefined {
		if (namespaceIri) {
			return this.prefixRegistry.isKnownVocabulary(prefix, namespaceIri) ? namespaceIri : undefined;
		}
		return this.prefixRegistry.getIri(prefix);
	}

	private async resolveRegisteredNamespace(prefix: string, namespaceIri?: string): Promise<string | undefined> {
		if (namespaceIri) {
			return this.prefixRegistry.isKnownVocabulary(prefix, namespaceIri) ? namespaceIri : undefined;
		}
		return await this.prefixRegistry.ensure(prefix);
	}

	private getReadySnapshot(baseIri: string): RemoteVocabularySnapshot | undefined {
		const key = normalizeNamespaceIri(baseIri);
		const cached = this.vocabularyCache.get(key);
		if (cached && !(cached instanceof Promise)) {
			return cached;
		}
		return undefined;
	}

	private async ensureVocabulary(prefix: string, baseIri: string): Promise<RemoteVocabularySnapshot> {
		const key = normalizeNamespaceIri(baseIri);
		const cached = this.vocabularyCache.get(key);
		if (cached) {
			return cached instanceof Promise ? await cached : cached;
		}

		const promise = this.fetchDereference(prefix, baseIri, { baseIri, timeoutMs: VOCAB_DEREFERENCE_TIMEOUT_MS })
			.then((snapshot) => {
				this.vocabularyCache.set(key, snapshot, { ttl: snapshot.terms.size ? REMOTE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS });
				return snapshot;
			})
			.catch((error) => {
				console.log(`Something went wrong while dereferencing ${baseIri}: ${error?.message ?? error}`);
				const snapshot = emptySnapshot(baseIri);
				this.vocabularyCache.set(key, snapshot, { ttl: NEGATIVE_CACHE_TTL_MS });
				return snapshot;
			});
		this.vocabularyCache.set(key, promise);
		return await promise;
	}

	private async ensureExactTerm(prefix: string, term: string, termIri: string, baseIri: string): Promise<RemoteTermInfo | undefined> {
		const key = this.exactTermKey(baseIri, term);
		const cached = this.exactTermLookupCache.get(key);
		if (cached) {
			return cached instanceof Promise ? await cached : undefined;
		}

		const promise = this.fetchDereference(prefix, termIri, { baseIri, expectedTerm: term, expectedIri: termIri, timeoutMs: TERM_DEREFERENCE_TIMEOUT_MS })
			.then((snapshot) => {
				const info = snapshot.infoByTerm.get(term);
				if (info) {
					this.mergeTermIntoVocabulary(prefix, baseIri, term, info);
					this.exactTermLookupCache.delete(key);
				} else {
					this.exactTermLookupCache.set(key, REMOTE_TERM_MISS, { ttl: NEGATIVE_CACHE_TTL_MS });
				}
				return info;
			})
			.catch((error) => {
				console.log(`Something went wrong while dereferencing ${termIri}: ${error?.message ?? error}`);
				this.exactTermLookupCache.set(key, REMOTE_TERM_MISS, { ttl: NEGATIVE_CACHE_TTL_MS });
				return undefined;
			});
		this.exactTermLookupCache.set(key, promise);
		return await promise;
	}


	private async fetchDereference(
		prefix: string,
		iriToDereference: string,
		options: { baseIri: string; expectedTerm?: string; expectedIri?: string; timeoutMs: number },
	): Promise<RemoteVocabularySnapshot> {
		const quads = await this.fetcher.dereferenceQuads(iriToDereference, { timeoutMs: options.timeoutMs });
		const graph = this.parser.parse(quads, {
			prefix,
			baseIri: options.baseIri,
			expectedTerm: options.expectedTerm,
			expectedIri: options.expectedIri,
		});

		const infoByTerm = new Map<string, RemoteTermInfo>();
		for (const [term, info] of graph.mutableByTerm.entries()) {
			infoByTerm.set(term, {
				prefix,
				term,
				vocabulary: freezeVocabularyInfo(info),
			});
		}

		const terms = new Set(graph.terms);

		return {
			namespaceIri: options.baseIri,
			terms,
			infoByTerm,
			source: graph.terms.size ? 'remote' : 'empty',
			fetchedAt: Date.now(),
		};
	}

	private mergeTermIntoVocabulary(prefix: string, baseIri: string, term: string, info: RemoteTermInfo): void {
		const key = normalizeNamespaceIri(baseIri);
		const cached = this.vocabularyCache.get(key);
		if (!cached || cached instanceof Promise) {return;}
		const existing = cached.infoByTerm.get(term);
		const vocabulary = mergeVocabularyInfos(existing?.vocabulary, info.vocabulary);
		if (!vocabulary) {return;}
		cached.terms.add(term);
		cached.infoByTerm.set(term, { prefix, term, vocabulary });
		cached.source = sourceForMerge(cached.source, 'remote');
		this.vocabularyCache.set(key, cached, { ttl: REMOTE_CACHE_TTL_MS });
	}

	private exactTermKey(baseIri: string, term: string): string {
		return normalizeNamespaceIri(`${baseIri}${term}`);
	}
}
