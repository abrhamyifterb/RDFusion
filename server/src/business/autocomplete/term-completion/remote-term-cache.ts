/* eslint-disable @typescript-eslint/no-explicit-any */
import { LRUCache } from 'lru-cache';
import fetch from 'node-fetch';
import { rdfDereferencer } from 'rdf-dereference';
import { PrefixRegistry } from '../prefix/prefix-registry';
import { Connection } from 'vscode-languageserver';

export class RemoteTermCache {
	private cache = new LRUCache<string, Set<string>>({	max: 200, ttl: 60 * 60 * 1000 });

	constructor(
		private prefixRegistry: PrefixRegistry,
	) {}

	public async get(prefixQuery: string, connection: Connection): Promise<Set<string>> {
		if (this.cache.has(prefixQuery)) {
			return this.cache.get(prefixQuery)!;
		}

		const [prefix, fragment] = prefixQuery.split(':', 2);
		const iri = await this.prefixRegistry.ensure(prefix);

		if (!iri) {
			const empty = new Set<string>();
			this.cache.set(prefixQuery, empty);
			return empty;
		}
		const allTerms = await this.fetchDereference(iri);;
		if (fragment) {
			const terms = await this.fetchLov(prefixQuery);
			terms.forEach(t => allTerms.add(t));
		}

		this.cache.set(prefixQuery, allTerms);
		if (allTerms.size < 1) {
			connection.window.showErrorMessage(`Unable to fetch terms for prefix "${prefix}". The vocabulary may be unavailable or your network connection failed.`);
		}
		return allTerms;
	}

	private async fetchLov(q: string): Promise<Set<string>> {
		try {
			const url = `https://lov.linkeddata.es/dataset/lov/api/v2/term/autocomplete?q=${encodeURIComponent(q)}`;
			const res = await fetch(url);
			if (!res.ok) {
				return new Set();
			}
			const data = (await res.json() as any);
			if (!data?.results) {
				return new Set();
			}
			return new Set(
				data?.results.map((r: any) => r.localName[0] as string)
			);
		} catch {
			return new Set();
		}
	}

	private async fetchDereference(baseIri: string): Promise<Set<string>> {
		const terms = new Set<string>();
		try {
		const { data } = await rdfDereferencer.dereference(baseIri);
		await new Promise<void>((resolve, reject) => {
			data.on('data', (quad: any) => {
				for (const node of [quad.subject, quad.predicate, quad.object]) {
					if (node.termType === 'NamedNode' && node.value.startsWith(baseIri)) {
						const local = node.value.slice(baseIri.length);
						// console.dir(baseIri);
						if (local) {terms.add(local);}
					}
				}
			})
			.on('error', reject)
			.on('end', resolve);
		});
		} catch {
			console.log(`Something went wrong while dereferencing ${baseIri}`);
		}
		return terms;
	}
}
