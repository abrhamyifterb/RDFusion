/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	dereference: vi.fn(),
}));

vi.mock('rdf-dereference', () => ({
	rdfDereferencer: {
		dereference: mocks.dereference,
	},
}));

import { RemoteVocabularyFetcher, withTimeout } from '../../../business/autocomplete/term-completion/remote-vocabulary-fetcher';

function stream(values: any[]): Readable {
	return Readable.from(values, { objectMode: true });
}

describe('RemoteVocabularyFetcher', () => {
	beforeEach(() => {
		mocks.dereference.mockReset();
	});

	it('dereferences an IRI and collects RDF quads from the returned stream', async () => {
		const quads = [{ subject: { value: 's' }, predicate: { value: 'p' }, object: { value: 'o' } }];
		mocks.dereference.mockResolvedValue({ data: stream(quads) });

		const fetcher = new RemoteVocabularyFetcher();
		await expect(fetcher.dereferenceQuads('http://example.com/vocab#', { timeoutMs: 1000 })).resolves.toEqual(quads);
		expect(mocks.dereference).toHaveBeenCalledWith('http://example.com/vocab#');
	});

	it('propagates stream errors to the caller', async () => {
		const failing = new Readable({ objectMode: true, read() { /* wait for explicit destroy */ } });
		mocks.dereference.mockResolvedValue({ data: failing });

		const fetcher = new RemoteVocabularyFetcher();
		const promise = fetcher.dereferenceQuads('http://example.com/broken#', { timeoutMs: 1000 });
		failing.destroy(new Error('stream failed'));

		await expect(promise).rejects.toThrow('stream failed');
	});

	it('applies a timeout to remote requests', async () => {
		vi.useFakeTimers();
		try {
			const promise = withTimeout(new Promise(() => undefined), 25, 'Remote vocabulary request');
			vi.advanceTimersByTime(25);
			await expect(promise).rejects.toThrow('Remote vocabulary request timed out after 25ms');
		} finally {
			vi.useRealTimers();
		}
	});
});
