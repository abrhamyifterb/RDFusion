import { uniqueSorted } from '../../../data/rdf/rdf-term-utils';

export type LocalTermRole = 'subject' | 'predicate' | 'object' | 'class' | 'property' | 'shape';

export type RoleCounts = Record<'subject' | 'predicate' | 'object', number>;

export interface LocalTermVocabularyInfo {
	iri?: string;
	roles: LocalTermRole[];
	labels: string[];
	comments: string[];
	notes: string[];
	status: string[];
	types: string[];
	domains: string[];
	ranges: string[];
	subClassOf: string[];
	subPropertyOf: string[];
	equivalentTerms: string[];
	inverseOf: string[];
	seeAlso: string[];
	isDefinedBy: string[];
	examples: string[];
	occurrences: RoleCounts;
}

export interface MutableVocabularyInfo {
	iri?: string;
	roles: Set<LocalTermRole>;
	labels: Set<string>;
	comments: Set<string>;
	notes: Set<string>;
	status: Set<string>;
	types: Set<string>;
	domains: Set<string>;
	ranges: Set<string>;
	subClassOf: Set<string>;
	subPropertyOf: Set<string>;
	equivalentTerms: Set<string>;
	inverseOf: Set<string>;
	seeAlso: Set<string>;
	isDefinedBy: Set<string>;
	examples: Set<string>;
	occurrences: RoleCounts;
}

export function createMutableVocabularyInfo(iri?: string): MutableVocabularyInfo {
	return {
		iri,
		roles: new Set(),
		labels: new Set(),
		comments: new Set(),
		notes: new Set(),
		status: new Set(),
		types: new Set(),
		domains: new Set(),
		ranges: new Set(),
		subClassOf: new Set(),
		subPropertyOf: new Set(),
		equivalentTerms: new Set(),
		inverseOf: new Set(),
		seeAlso: new Set(),
		isDefinedBy: new Set(),
		examples: new Set(),
		occurrences: { subject: 0, predicate: 0, object: 0 },
	};
}

export function mergeMutableVocabularyInfo(target: MutableVocabularyInfo, source: MutableVocabularyInfo): void {
	target.iri ??= source.iri;
	for (const role of source.roles) target.roles.add(role);
	for (const label of source.labels) target.labels.add(label);
	for (const comment of source.comments) target.comments.add(comment);
	for (const note of source.notes) target.notes.add(note);
	for (const status of source.status) target.status.add(status);
	for (const type of source.types) target.types.add(type);
	for (const domain of source.domains) target.domains.add(domain);
	for (const range of source.ranges) target.ranges.add(range);
	for (const parent of source.subClassOf) target.subClassOf.add(parent);
	for (const parent of source.subPropertyOf) target.subPropertyOf.add(parent);
	for (const equivalent of source.equivalentTerms) target.equivalentTerms.add(equivalent);
	for (const inverse of source.inverseOf) target.inverseOf.add(inverse);
	for (const seeAlso of source.seeAlso) target.seeAlso.add(seeAlso);
	for (const definedBy of source.isDefinedBy) target.isDefinedBy.add(definedBy);
	for (const example of source.examples) target.examples.add(example);
	target.occurrences.subject += source.occurrences.subject;
	target.occurrences.predicate += source.occurrences.predicate;
	target.occurrences.object += source.occurrences.object;
}

export function freezeVocabularyInfo(info: MutableVocabularyInfo): LocalTermVocabularyInfo {
	return {
		iri: info.iri,
		roles: Array.from(info.roles).sort(),
		labels: uniqueSorted(info.labels, 8),
		comments: uniqueSorted(info.comments, 6),
		notes: uniqueSorted(info.notes, 6),
		status: uniqueSorted(info.status, 4),
		types: uniqueSorted(info.types, 12),
		domains: uniqueSorted(info.domains, 12),
		ranges: uniqueSorted(info.ranges, 12),
		subClassOf: uniqueSorted(info.subClassOf, 12),
		subPropertyOf: uniqueSorted(info.subPropertyOf, 12),
		equivalentTerms: uniqueSorted(info.equivalentTerms, 12),
		inverseOf: uniqueSorted(info.inverseOf, 12),
		seeAlso: uniqueSorted(info.seeAlso, 8),
		isDefinedBy: uniqueSorted(info.isDefinedBy, 8),
		examples: uniqueSorted(info.examples, 8),
		occurrences: { ...info.occurrences },
	};
}

export function mergeVocabularyInfos(
	...infos: (LocalTermVocabularyInfo | undefined)[]
): LocalTermVocabularyInfo | undefined {
	const mutable = createMutableVocabularyInfo();
	let saw = false;

	for (const info of infos) {
		if (!info) {
			continue;
		}
		saw = true;
		mutable.iri ??= info.iri;
		for (const role of info.roles) mutable.roles.add(role);
		for (const label of info.labels) mutable.labels.add(label);
		for (const comment of info.comments) mutable.comments.add(comment);
		for (const note of info.notes ?? []) mutable.notes.add(note);
		for (const status of info.status ?? []) mutable.status.add(status);
		for (const type of info.types) mutable.types.add(type);
		for (const domain of info.domains) mutable.domains.add(domain);
		for (const range of info.ranges) mutable.ranges.add(range);
		for (const parent of info.subClassOf) mutable.subClassOf.add(parent);
		for (const parent of info.subPropertyOf) mutable.subPropertyOf.add(parent);
		for (const equivalent of info.equivalentTerms) mutable.equivalentTerms.add(equivalent);
		for (const inverse of info.inverseOf ?? []) mutable.inverseOf.add(inverse);
		for (const seeAlso of info.seeAlso) mutable.seeAlso.add(seeAlso);
		for (const definedBy of info.isDefinedBy) mutable.isDefinedBy.add(definedBy);
		for (const example of info.examples) mutable.examples.add(example);
		mutable.occurrences.subject += info.occurrences.subject;
		mutable.occurrences.predicate += info.occurrences.predicate;
		mutable.occurrences.object += info.occurrences.object;
	}

	return saw ? freezeVocabularyInfo(mutable) : undefined;
}
