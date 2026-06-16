import { DataManager } from '../../../data/data-manager';
import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';
import type { PrefixRegistry } from '../prefix/prefix-registry.js';
import {
	OWL_EQUIVALENT_CLASS,
	OWL_EQUIVALENT_PROPERTY,
	OWL_DEPRECATED,
	OWL_IMPORTS,
	OWL_INVERSE_OF,
	OWL_PROPERTY_DISJOINT_WITH,
	OWL_SAME_AS,
	OWL_VERSION_INFO,
	OWL_VERSION_IRI,
	RDF_CLASS_TYPES,
	RDF_COMMENT_PREDICATES,
	RDF_LABEL_PREDICATES,
	RDF_NOTE_PREDICATES,
	RDF_PROPERTY_TYPES,
	RDF_TYPE,
	RDFS_DOMAIN,
	RDFS_IS_DEFINED_BY,
	RDFS_RANGE,
	RDFS_SEE_ALSO,
	RDFS_SUB_CLASS_OF,
	RDFS_SUB_PROPERTY_OF,
	SHACL_SHAPE_TYPES,
	VS_TERM_STATUS,
} from '../../../data/rdf/rdf-vocabulary';
import { rdfLiteralText, rdfTermType, rdfTermValue } from '../../../data/rdf/rdf-term-utils';
import {
	createMutableVocabularyInfo,
	freezeVocabularyInfo,
	mergeMutableVocabularyInfo,
	type LocalTermVocabularyInfo,
	type MutableVocabularyInfo,
} from '../term-metadata/vocabulary-info';

export type { LocalTermRole, LocalTermVocabularyInfo } from '../term-metadata/vocabulary-info';

export interface LocalTermInfo {
	prefix: string;
	term: string;
	sourceUris: string[];
	vocabulary?: LocalTermVocabularyInfo;
}

interface PerUriIndex {
	terms: Map<string, Set<string>>;
	vocabulary: Map<string, MutableVocabularyInfo>;
}

export class LocalTermCache {
	private terms = new Map<string, Set<string>>();
	private termsByUri = new Map<string, PerUriIndex>();
	private termSources = new Map<string, Map<string, Set<string>>>();
	private vocabularyByKey = new Map<string, MutableVocabularyInfo>();

	constructor(
		private dataManager: DataManager,
		private prefixRegistry?: PrefixRegistry,
	) {}

	public rebuild(): void {
		this.terms.clear();
		this.termsByUri.clear();
		this.termSources.clear();
		this.vocabularyByKey.clear();

		for (const snapshot of this.dataManager.getAllSnapshots()) {
			this.setTermsForUri(snapshot.uri, this.extractTerms(snapshot.parsedGraph));
		}
	}

	public updateUri(uri: string): void {
		const snapshot = this.dataManager.getSnapshot(uri);
		if (!snapshot) {
			this.removeUri(uri);
			return;
		}
		this.setTermsForUri(uri, this.extractTerms(snapshot.parsedGraph));
	}

	public removeUri(uri: string): void {
		const previous = this.termsByUri.get(uri);
		if (!previous) {
			return;
		}
		this.subtract(previous, uri);
		this.termsByUri.delete(uri);
	}

	private setTermsForUri(uri: string, next: PerUriIndex): void {
		this.removeUri(uri);
		if (next.terms.size === 0 && next.vocabulary.size === 0) {
			return;
		}
		this.termsByUri.set(uri, next);
		this.addAll(next, uri);
	}

	private extractTerms(parsed: ParsedGraph | JsonldParsedGraph): PerUriIndex {
		const out: PerUriIndex = { terms: new Map(), vocabulary: new Map() };
		const prefixes = this.prefixesFor(parsed);
		const add = (prefix: string, term: string) => {
			if (!prefix || !term) {
				return;
			}
			let set = out.terms.get(prefix);
			if (!set) {
				set = new Set<string>();
				out.terms.set(prefix, set);
			}
			set.add(term);
		};
		const toCurie = (iri: string): { prefix: string; term: string; key: string } | undefined => {
			const directPrefix = this.prefixRegistry?.getPrefix(iri);
			if (directPrefix) {
				const base = this.prefixRegistry?.getIri(directPrefix);
				if (base && iri.startsWith(base)) {
					return { prefix: directPrefix, term: iri.slice(base.length), key: `${directPrefix}:${iri.slice(base.length)}` };
				}
			}
			const entries = Object.entries(prefixes).sort((a, b) => b[1].length - a[1].length);
			for (const [prefix, base] of entries) {
				if (base && iri.startsWith(base)) {
					const term = iri.slice(base.length);
					if (term) {
						return { prefix, term, key: `${prefix}:${term}` };
					}
				}
			}
			return undefined;
		};
		const infoForIri = (iri: string): MutableVocabularyInfo | undefined => {
			const curie = toCurie(iri);
			if (!curie) {
				return undefined;
			}
			add(curie.prefix, curie.term);
			let info = out.vocabulary.get(curie.key);
			if (!info) {
				info = createMutableVocabularyInfo(iri);
				out.vocabulary.set(curie.key, info);
			}
			info.iri ??= iri;
			return info;
		};
		const formatTerm = (iri: string): string => {
			const curie = toCurie(iri);
			return curie?.key ?? iri;
		};

		if ('tokens' in parsed) {
			const mapping = parsed.prefixes || {};
			for (const token of parsed.tokens ?? []) {
				if (!token?.image?.includes(':')) { continue; }
				const [pfx, term] = token.image.split(':', 2);
				if (mapping[pfx] && term) {
					add(pfx, term);
				}
			}
		} else if ('definitions' in parsed) {
			for (const def of parsed.definitions ?? []) {
				if (!def?.id?.includes(':')) { continue; }
				const [pfx, local] = def.id.split(':', 2);
				if ((parsed.prefixMap ?? parsed.contextMap).has(pfx) && local) {
					add(pfx, local);
				}
			}
		}

		for (const quad of parsed.quads ?? []) {
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
				if (SHACL_SHAPE_TYPES.has(object)) subjectInfo.roles.add('shape');
				if (objectInfo && !RDF_CLASS_TYPES.has(object) && !RDF_PROPERTY_TYPES.has(object) && !SHACL_SHAPE_TYPES.has(object)) {
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

		return out;
	}

	private prefixesFor(parsed: ParsedGraph | JsonldParsedGraph): Record<string, string> {
		const prefixes: Record<string, string> = {};
		for (const { prefix, iri } of this.prefixRegistry?.getAll() ?? []) {
			prefixes[prefix] = iri;
		}
		if ('prefixes' in parsed && parsed.prefixes) {
			Object.assign(prefixes, parsed.prefixes);
		}
		if ('prefixMap' in parsed && parsed.prefixMap) {
			for (const [prefix, iri] of parsed.prefixMap.entries()) {
				prefixes[prefix] = iri;
			}
		} else if ('contextMap' in parsed) {
			for (const [prefix, iri] of parsed.contextMap.entries()) {
				if (iri && !iri.startsWith('@') && /[:/?#[\]@]$/.test(iri)) {
					prefixes[prefix] = iri;
				}
			}
		}
		return prefixes;
	}

	private addAll(index: PerUriIndex, uri: string) {
		for (const [prefix, terms] of index.terms) {
			let global = this.terms.get(prefix);
			if (!global) {
				global = new Set<string>();
				this.terms.set(prefix, global);
			}

			let sourcesByTerm = this.termSources.get(prefix);
			if (!sourcesByTerm) {
				sourcesByTerm = new Map<string, Set<string>>();
				this.termSources.set(prefix, sourcesByTerm);
			}

			for (const term of terms) {
				global.add(term);
				let sources = sourcesByTerm.get(term);
				if (!sources) {
					sources = new Set<string>();
					sourcesByTerm.set(term, sources);
				}
				sources.add(uri);
			}
		}

		for (const [key, info] of index.vocabulary) {
			let global = this.vocabularyByKey.get(key);
			if (!global) {
				global = createMutableVocabularyInfo(info.iri);
				this.vocabularyByKey.set(key, global);
			}
			mergeMutableVocabularyInfo(global, info);
		}
	}

	private subtract(index: PerUriIndex, uri: string) {
		for (const [prefix, terms] of index.terms) {
			const global = this.terms.get(prefix);
			const sourcesByTerm = this.termSources.get(prefix);
			if (!global) {
				continue;
			}
			for (const term of terms) {
				sourcesByTerm?.get(term)?.delete(uri);
				if (sourcesByTerm?.get(term)?.size === 0) {
					sourcesByTerm.delete(term);
				}
				if (!this.isTermUsedElsewhere(prefix, term, index)) {
					global.delete(term);
				}
			}
			if (global.size === 0) {
				this.terms.delete(prefix);
			}
			if (sourcesByTerm?.size === 0) {
				this.termSources.delete(prefix);
			}
		}

		for (const key of index.vocabulary.keys()) {
			this.rebuildVocabularyKey(key, index);
		}
	}

	private rebuildVocabularyKey(key: string, excluding: PerUriIndex): void {
		let next: MutableVocabularyInfo | undefined;
		for (const index of this.termsByUri.values()) {
			if (index === excluding) {
				continue;
			}
			const info = index.vocabulary.get(key);
			if (!info) {
				continue;
			}
			if (!next) {
				next = createMutableVocabularyInfo(info.iri);
			}
			mergeMutableVocabularyInfo(next, info);
		}
		if (next) {
			this.vocabularyByKey.set(key, next);
		} else {
			this.vocabularyByKey.delete(key);
		}
	}

	private isTermUsedElsewhere(prefix: string, term: string, excluding: PerUriIndex): boolean {
		for (const index of this.termsByUri.values()) {
			if (index === excluding) {
				continue;
			}
			if (index.terms.get(prefix)?.has(term)) {
				return true;
			}
		}
		return false;
	}

	public get(prefix: string): Set<string> | undefined {
		return this.terms.get(prefix);
	}

	public getInfo(prefix: string, term: string): LocalTermInfo | undefined {
		const sources = this.termSources.get(prefix)?.get(term);
		const vocabulary = this.vocabularyByKey.get(`${prefix}:${term}`);
		if ((!sources || sources.size === 0) && !vocabulary) {
			return undefined;
		}
		return {
			prefix,
			term,
			sourceUris: Array.from(sources ?? []).sort(),
			vocabulary: vocabulary ? freezeVocabularyInfo(vocabulary) : undefined,
		};
	}
}
