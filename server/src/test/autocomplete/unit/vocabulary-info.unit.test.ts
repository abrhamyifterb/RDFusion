import { describe, expect, it } from 'vitest';
import {
	createMutableVocabularyInfo,
	freezeVocabularyInfo,
	mergeMutableVocabularyInfo,
	mergeVocabularyInfos,
} from '../../../business/autocomplete/term-metadata/vocabulary-info';

describe('vocabulary-info helpers', () => {
	it('freezes mutable vocabulary info with sorted unique values and copied occurrences', () => {
		const mutable = createMutableVocabularyInfo('http://example.test/name');
		mutable.roles.add('property');
		mutable.roles.add('predicate');
		mutable.labels.add('Name');
		mutable.labels.add('Name');
		mutable.labels.add('Preferred name');
		mutable.types.add('rdf:Property');
		mutable.occurrences.predicate = 2;

		const frozen = freezeVocabularyInfo(mutable);

		expect(frozen).toMatchObject({
			iri: 'http://example.test/name',
			roles: ['predicate', 'property'],
			labels: ['Name', 'Preferred name'],
			types: ['rdf:Property'],
			occurrences: { subject: 0, predicate: 2, object: 0 },
		});

		mutable.occurrences.predicate = 10;
		expect(frozen.occurrences.predicate).toBe(2);
	});

	it('merges mutable vocabulary info without losing existing metadata', () => {
		const target = createMutableVocabularyInfo('http://example.test/Person');
		target.roles.add('class');
		target.labels.add('Person');
		target.occurrences.subject = 1;

		const source = createMutableVocabularyInfo();
		source.roles.add('object');
		source.comments.add('A person resource');
		source.occurrences.object = 3;

		mergeMutableVocabularyInfo(target, source);
		const frozen = freezeVocabularyInfo(target);

		expect(frozen.iri).toBe('http://example.test/Person');
		expect(frozen.roles).toEqual(['class', 'object']);
		expect(frozen.labels).toEqual(['Person']);
		expect(frozen.comments).toEqual(['A person resource']);
		expect(frozen.occurrences).toEqual({ subject: 1, predicate: 0, object: 3 });
	});

	it('merges frozen local and remote vocabulary info consistently', () => {
		const local = freezeVocabularyInfo(createMutableVocabularyInfo('http://example.test/status'));
		const remoteMutable = createMutableVocabularyInfo();
		remoteMutable.roles.add('property');
		remoteMutable.labels.add('Status');
		remoteMutable.ranges.add('xsd:string');
		remoteMutable.occurrences.predicate = 4;

		const merged = mergeVocabularyInfos(local, freezeVocabularyInfo(remoteMutable));

		expect(merged).toBeDefined();
		expect(merged?.iri).toBe('http://example.test/status');
		expect(merged?.roles).toEqual(['property']);
		expect(merged?.labels).toEqual(['Status']);
		expect(merged?.ranges).toEqual(['xsd:string']);
		expect(merged?.occurrences).toEqual({ subject: 0, predicate: 4, object: 0 });
	});
});
