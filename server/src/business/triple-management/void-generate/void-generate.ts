import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';

export class VoIDGenerator {
	public generateVoID(parsed: ParsedGraph | JsonldParsedGraph): string {
		const quads = parsed.quads;

		const title = "Auto Generated VoID Title (Change based on data)";
		const description = "Auto Generated VoID description (Change based on data).";
		const created = new Date().toISOString().split('T')[0];;

		const tripleCount = quads.length;
		const subjects = new Set<string>();
		const objects = new Set<string>();
		const predicates = new Map<string, number>();
		const classMap = new Map<string, Set<string>>();

		let declaredVocabs: Set<string>;
		if ('prefixes' in parsed && parsed.prefixes) {
		declaredVocabs = new Set(Object.values(parsed.prefixes));
		} else if ('contextMap' in parsed && parsed.contextMap) {
		declaredVocabs = new Set(parsed.contextMap.values());
		} else {
		declaredVocabs = new Set();
		}

		const usedVocabs = new Set<string>();

		for (const quad of quads) {
			const sub = quad.subject.value;
			const pre = quad.predicate.value;
			const obj = quad.object.value;

			subjects.add(sub);
			objects.add(obj);
			predicates.set(pre, (predicates.get(pre) || 0) + 1);

			if (pre === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
				if (!classMap.has(obj)) classMap.set(obj, new Set());
				classMap.get(obj)!.add(sub);
			}

			for (const ns of declaredVocabs) {
				if (sub.startsWith(ns) || pre.startsWith(ns) || obj.startsWith(ns)) {
					usedVocabs.add(ns);
				}
			}

			if (quad.object.datatype && quad.object.datatype.value) {
				// eslint-disable-next-line no-useless-escape
				usedVocabs.add(quad.object.datatype.value.replace(/(.*[\/#]).+$/, '$1'));
			}
		}

		const lines: string[] = [];
		lines.push(`@prefix void: <http://rdfs.org/ns/void#> .`);
		lines.push(`@prefix dcterms: <http://purl.org/dc/terms/> .`);
		lines.push(``);
		lines.push(`<#dataset> a void:Dataset ;`);
		lines.push(`    dcterms:title "${title}" ;`);
		lines.push(`    dcterms:description "${description}" ;`);
		lines.push(
		`    dcterms:created "${created}"^^<http://www.w3.org/2001/XMLSchema#date> ;`
		);
		lines.push(`    void:triples ${tripleCount} ;`);
		lines.push(`    void:distinctSubjects ${subjects.size} ;`);
		lines.push(`    void:distinctObjects ${objects.size} ;`);
		lines.push(`    void:properties ${predicates.size} ;`);

		for (const [prop, count] of predicates) {
			lines.push(`    void:propertyPartition [`);
			lines.push(`        void:property <${prop}> ;`);
			lines.push(`        void:triples ${count} `);
			lines.push(`    ] ;`);
		}

		for (const [cls, insts] of classMap) {
			lines.push(`    void:classPartition [`);
			lines.push(`        void:class <${cls}> ;`);
			lines.push(`        void:entities ${insts.size} `);
			lines.push(`    ] ;`);
		}

		for (const ns of usedVocabs) {
			lines.push(`    void:vocabulary <${ns}> ;`);
		}

		const last = lines.length - 1;
		lines[last] = lines[last].replace(/;\s*$/, ' .');

		return lines.join('\n');
	}
}
