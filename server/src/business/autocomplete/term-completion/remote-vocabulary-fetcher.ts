/* eslint-disable @typescript-eslint/no-explicit-any */
import { rdfDereferencer } from 'rdf-dereference';

export interface RemoteVocabularyDereferenceOptions {
	timeoutMs: number;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => { clearTimeout(timer); resolve(value); },
			(error) => { clearTimeout(timer); reject(error); },
		);
	});
}

/**
 * Handles remote RDF dereferencing and stream collection for vocabulary data.
 * It deliberately does not parse, cache, validate, or interpret vocabulary
 * terms; those responsibilities stay in the parser/cache/validator layers.
 */
export class RemoteVocabularyFetcher {
	public async dereferenceQuads(iri: string, options: RemoteVocabularyDereferenceOptions): Promise<any[]> {
		const response = await withTimeout(
			rdfDereferencer.dereference(iri),
			options.timeoutMs,
			`Dereferencing ${iri}`,
		);
		return await this.collectQuads(response.data, options.timeoutMs);
	}

	private collectQuads(data: any, timeoutMs: number): Promise<any[]> {
		return new Promise<any[]>((resolve, reject) => {
			const quads: any[] = [];
			const timer = setTimeout(() => {
				if (typeof data?.destroy === 'function') {
					data.destroy();
				}
				resolve(quads);
			}, timeoutMs);

			data.on('data', (quad: any) => quads.push(quad));
			data.on('error', (error: unknown) => {
				clearTimeout(timer);
				reject(error);
			});
			data.on('end', () => {
				clearTimeout(timer);
				resolve(quads);
			});
		});
	}
}
