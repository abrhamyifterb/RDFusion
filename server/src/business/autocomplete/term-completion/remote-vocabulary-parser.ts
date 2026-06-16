/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	OWL_EQUIVALENT_CLASS,
	OWL_EQUIVALENT_PROPERTY,
	OWL_INVERSE_OF,
	OWL_DEPRECATED,
	OWL_IMPORTS,
	OWL_PROPERTY_DISJOINT_WITH,
	OWL_SAME_AS,
	OWL_VERSION_INFO,
	OWL_VERSION_IRI,
	RDF_CLASS_TYPES,
	RDF_COMMENT_PREDICATES,
	RDF_NOTE_PREDICATES,
	RDF_LABEL_PREDICATES,
	RDF_PROPERTY_TYPES,
	RDF_TYPE,
	RDFS_DOMAIN,
	RDFS_IS_DEFINED_BY,
	RDFS_RANGE,
	RDFS_SEE_ALSO,
	RDFS_SUB_CLASS_OF,
	RDFS_SUB_PROPERTY_OF,
	VS_TERM_STATUS,
} from '../../../data/rdf/rdf-vocabulary';
import { rdfLiteralText, rdfTermType, rdfTermValue } from '../../../data/rdf/rdf-term-utils';
import {
	createMutableVocabularyInfo,
	mergeMutableVocabularyInfo,
	type MutableVocabularyInfo,
} from '../term-metadata/vocabulary-info';

export interface RemoteVocabularyPrefixResolver {
	getPrefix(iri: string): string | undefined;
	getIri(prefix: string): string | undefined;
}

export interface RemoteVocabularyParseOptions {
	prefix: string;
	baseIri: string;
	expectedTerm?: string;
	expectedIri?: string;
}

export interface ParsedRemoteVocabularyGraph {
	terms: Set<string>;
	mutableByTerm: Map<string, MutableVocabularyInfo>;
}

/**
 * Extracts local vocabulary terms and metadata from RDF quads returned by a
 * remote vocabulary dereference. The parser is intentionally pure: it does not
 * fetch, cache, or decide whether parsed terms are authoritative for validation.
 */
export class RemoteVocabularyParser {
	constructor(
		private readonly prefixResolver: RemoteVocabularyPrefixResolver,
	) {}

	public parse(quads: any[], options: RemoteVocabularyParseOptions): ParsedRemoteVocabularyGraph {
		const { prefix, baseIri, expectedTerm, expectedIri } = options;
		const terms = new Set<string>();
		const mutableByTerm = new Map<string, MutableVocabularyInfo>();

		const toLocal = (iri: string): string | undefined => {
			if (expectedIri && iri === expectedIri && expectedTerm) return expectedTerm;
			if (!iri.startsWith(baseIri)) return undefined;
			const local = iri.slice(baseIri.length);
			return local || undefined;
		};

		const formatTerm = (iri: string): string => {
			const local = toLocal(iri);
			if (local) return `${prefix}:${local}`;

			const knownPrefix = this.prefixResolver.getPrefix(iri);
			const knownBase = knownPrefix ? this.prefixResolver.getIri(knownPrefix) : undefined;
			if (knownPrefix && knownBase && iri.startsWith(knownBase)) {
				const term = iri.slice(knownBase.length);
				return term ? `${knownPrefix}:${term}` : iri;
			}
			return iri;
		};

		const infoForIri = (iri: string): MutableVocabularyInfo | undefined => {
			const local = toLocal(iri);
			if (!local) return undefined;
			terms.add(local);
			let info = mutableByTerm.get(local);
			if (!info) {
				info = createMutableVocabularyInfo(iri);
				mutableByTerm.set(local, info);
			}
			info.iri ??= iri;
			return info;
		};

		for (const quad of quads) {
			const subject = rdfTermValue(quad.subject);
			const predicate = rdfTermValue(quad.predicate);
			const object = rdfTermValue(quad.object);
			const subjectInfo = rdfTermType(quad.subject) === 'NamedNode' ? infoForIri(subject) : undefined;
			const predicateInfo = rdfTermType(quad.predicate) === 'NamedNode' ? infoForIri(predicate) : undefined;
			const objectInfo = rdfTermType(quad.object) === 'NamedNode' ? infoForIri(object) : undefined;

			if (subjectInfo) {
				subjectInfo.roles.add('subject');
				subjectInfo.occurrences.subject++;
			}
			if (predicateInfo) {
				predicateInfo.roles.add('predicate');
				predicateInfo.roles.add('property');
				predicateInfo.occurrences.predicate++;
			}
			if (objectInfo) {
				objectInfo.roles.add('object');
				objectInfo.occurrences.object++;
			}

			if (subjectInfo && predicate === RDF_TYPE) {
				subjectInfo.types.add(formatTerm(object));
				if (RDF_CLASS_TYPES.has(object)) subjectInfo.roles.add('class');
				if (RDF_PROPERTY_TYPES.has(object)) subjectInfo.roles.add('property');
				if (objectInfo && !RDF_CLASS_TYPES.has(object) && !RDF_PROPERTY_TYPES.has(object)) {
					objectInfo.roles.add('class');
				}
			}

			const literal = rdfLiteralText(quad.object);
			if (subjectInfo && literal) {
				if (RDF_LABEL_PREDICATES.has(predicate)) {
					subjectInfo.labels.add(literal);
				}
				if (RDF_COMMENT_PREDICATES.has(predicate)) {
					subjectInfo.comments.add(literal);
				}
				if (RDF_NOTE_PREDICATES.has(predicate)) {
					subjectInfo.notes.add(literal);
				}
				if (predicate === VS_TERM_STATUS) {
					subjectInfo.status.add(literal);
				}
				if (predicate === OWL_VERSION_INFO) {
					subjectInfo.notes.add(`Version: ${literal}`);
				}
				if (predicate === OWL_DEPRECATED && !/^(false|0)$/i.test(literal)) {
					subjectInfo.status.add(/^true$/i.test(literal) ? 'deprecated' : `deprecated: ${literal}`);
				}
			}

			if (subjectInfo && rdfTermType(quad.object) === 'NamedNode') {
				if (predicate === RDFS_DOMAIN) subjectInfo.domains.add(formatTerm(object));
				if (predicate === RDFS_RANGE) subjectInfo.ranges.add(formatTerm(object));
				if (predicate === RDFS_SUB_CLASS_OF) subjectInfo.subClassOf.add(formatTerm(object));
				if (predicate === RDFS_SUB_PROPERTY_OF) subjectInfo.subPropertyOf.add(formatTerm(object));
				if (predicate === OWL_EQUIVALENT_CLASS || predicate === OWL_EQUIVALENT_PROPERTY || predicate === OWL_SAME_AS) subjectInfo.equivalentTerms.add(formatTerm(object));
				if (predicate === OWL_INVERSE_OF) subjectInfo.inverseOf.add(formatTerm(object));
				if (predicate === RDFS_SEE_ALSO || predicate === OWL_IMPORTS || predicate === OWL_VERSION_IRI || predicate === OWL_PROPERTY_DISJOINT_WITH) subjectInfo.seeAlso.add(formatTerm(object));
				if (predicate === RDFS_IS_DEFINED_BY) subjectInfo.isDefinedBy.add(formatTerm(object));
			}
		}

		if (expectedTerm && expectedIri) {
			const expected = mutableByTerm.get(expectedTerm);
			if (expected) {
				for (const [term, info] of mutableByTerm.entries()) {
					if (term !== expectedTerm && info.iri === expectedIri) {
						mergeMutableVocabularyInfo(expected, info);
						mutableByTerm.delete(term);
					}
				}
			}
		}

		return { terms, mutableByTerm };
	}
}
