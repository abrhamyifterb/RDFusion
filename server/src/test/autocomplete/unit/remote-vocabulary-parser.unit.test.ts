/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { RemoteVocabularyParser } from '../../../business/autocomplete/term-completion/remote-vocabulary-parser';
import { freezeVocabularyInfo } from '../../../business/autocomplete/term-metadata/vocabulary-info';
import {
	OWL_CLASS,
	OWL_OBJECT_PROPERTY,
	RDF_TYPE,
	RDFS_COMMENT,
	RDFS_DOMAIN,
	RDFS_LABEL,
	RDFS_RANGE,
	SKOS_ALT_LABEL,
	XSD_NS,
} from '../../../data/rdf/rdf-vocabulary';

function named(value: string): any {
	return { termType: 'NamedNode', value };
}

function literal(value: string): any {
	return { termType: 'Literal', value };
}

function q(s: string, p: string, o: any): any {
	return { subject: named(s), predicate: named(p), object: typeof o === 'string' ? named(o) : o };
}

function prefixResolver(): any {
	const prefixes: Record<string, string> = {
		ex: 'http://example.com/vocab#',
		owl: 'http://www.w3.org/2002/07/owl#',
		xsd: XSD_NS,
	};
	return {
		getIri: vi.fn((prefix: string) => prefixes[prefix]),
		getPrefix: vi.fn((iri: string) => Object.entries(prefixes).find(([, base]) => iri.startsWith(base))?.[0]),
	};
}

describe('RemoteVocabularyParser', () => {
	it('extracts terms and metadata from remote vocabulary quads', () => {
		const baseIri = 'http://example.com/vocab#';
		const parser = new RemoteVocabularyParser(prefixResolver());

		const parsed = parser.parse([
			q(`${baseIri}Person`, RDF_TYPE, OWL_CLASS),
			q(`${baseIri}Person`, RDFS_LABEL, literal('Person')),
			q(`${baseIri}Person`, RDFS_COMMENT, literal('A person resource.')),
			q(`${baseIri}prefLabel`, RDF_TYPE, OWL_OBJECT_PROPERTY),
			q(`${baseIri}prefLabel`, SKOS_ALT_LABEL, literal('preferred label')),
			q(`${baseIri}prefLabel`, RDFS_DOMAIN, `${baseIri}Person`),
			q(`${baseIri}prefLabel`, RDFS_RANGE, `${XSD_NS}string`),
		], { prefix: 'ex', baseIri });

		expect(parsed.terms).toEqual(new Set(['Person', 'prefLabel']));

		const person = freezeVocabularyInfo(parsed.mutableByTerm.get('Person')!);
		expect(person.roles).toContain('class');
		expect(person.types).toContain('owl:Class');
		expect(person.labels).toContain('Person');
		expect(person.comments).toContain('A person resource.');

		const prefLabel = freezeVocabularyInfo(parsed.mutableByTerm.get('prefLabel')!);
		expect(prefLabel.roles).toContain('property');
		expect(prefLabel.labels).toContain('preferred label');
		expect(prefLabel.domains).toContain('ex:Person');
		expect(prefLabel.ranges).toContain('xsd:string');
	});

	it('ignores terms outside the requested namespace while still formatting known external values', () => {
		const baseIri = 'http://example.com/vocab#';
		const parser = new RemoteVocabularyParser(prefixResolver());

		const parsed = parser.parse([
			q('http://other.example/vocab#External', RDFS_LABEL, literal('External')),
			q(`${baseIri}knows`, RDFS_RANGE, 'http://other.example/vocab#External'),
		], { prefix: 'ex', baseIri });

		expect(parsed.terms).toEqual(new Set(['knows']));
		expect(parsed.mutableByTerm.has('External')).toBe(false);

		const knows = freezeVocabularyInfo(parsed.mutableByTerm.get('knows')!);
		expect(knows.ranges).toContain('http://other.example/vocab#External');
	});

	it('maps exact-term dereference quads back to the requested local name', () => {
		const baseIri = 'http://example.com/vocab#';
		const termIri = `${baseIri}orphan`;
		const parser = new RemoteVocabularyParser(prefixResolver());

		const parsed = parser.parse([
			q(termIri, RDFS_COMMENT, literal('Only available from the term document.')),
		], {
			prefix: 'ex',
			baseIri,
			expectedTerm: 'orphan',
			expectedIri: termIri,
		});

		expect(parsed.terms).toEqual(new Set(['orphan']));
		const orphan = freezeVocabularyInfo(parsed.mutableByTerm.get('orphan')!);
		expect(orphan.iri).toBe(termIri);
		expect(orphan.comments).toContain('Only available from the term document.');
	});
});
