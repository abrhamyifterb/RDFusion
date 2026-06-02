/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonldParsedGraph, ParsedGraph } from '../irdf-parser';
import { IShapeExtractor, ShaclPropertyShapeInfo, ShaclShape, ShaclTargetBinding } from './ishape-extractor';
import {
	RDF_FIRST,
	RDF_NIL,
	RDF_REST,
	RDF_TYPE,
	SH_AND,
	SH_DESCRIPTION,
	SH_IN,
	SH_MESSAGE,
	SH_NAME,
	SH_NODE,
	SH_NODE_SHAPE,
	SH_OR,
	SH_PATH,
	SH_PROPERTY,
	SH_PROPERTY_SHAPE,
	SH_QUALIFIED_VALUE_SHAPE,
	SH_SHAPE,
	SH_TARGET,
	SH_TARGET_CLASS,
	SH_TARGET_NODE,
	SH_TARGET_OBJECTS_OF,
	SH_TARGET_SUBJECTS_OF,
	SH_XONE,
} from '../rdf/rdf-vocabulary';

const TARGET_PREDICATES = new Set([
	SH_TARGET,
	SH_TARGET_CLASS,
	SH_TARGET_NODE,
	SH_TARGET_OBJECTS_OF,
	SH_TARGET_SUBJECTS_OF,
]);

const DEPENDENCY_PREDICATES = new Set([
	SH_PROPERTY,
	SH_NODE,
	SH_QUALIFIED_VALUE_SHAPE,
	SH_OR,
	SH_AND,
	SH_XONE,
	SH_IN,
]);

function valueOf(term: any): string {
	return term?.value ?? String(term ?? '');
}

function termType(term: any): string {
	return term?.termType ?? '';
}

function shortIri(value: string): string {
	const hash = value.lastIndexOf('#');
	if (hash >= 0 && hash < value.length - 1) return value.slice(hash + 1);
	const slash = value.lastIndexOf('/');
	if (slash >= 0 && slash < value.length - 1) return value.slice(slash + 1);
	return value;
}

function literalText(term: any): string | undefined {
	if (!term) return undefined;
	if (term.termType === 'Literal') return term.value;
	return undefined;
}

function firstLiteral(quads: any[], subject: string, predicate: string): string | undefined {
	return literalText(quads.find(q => valueOf(q.subject) === subject && valueOf(q.predicate) === predicate)?.object);
}

export function targetKey(predicate: string, objectValue: string): string {
	return `${predicate}|${objectValue}`;
}

export function isTargetPredicate(predicate: string): boolean {
	return TARGET_PREDICATES.has(predicate);
}

export class ShaclShapeExtractor implements IShapeExtractor {
	extractShapes(parsedGraph: ParsedGraph | JsonldParsedGraph): ShaclShape[] {
		const quads = parsedGraph.quads ?? [];
		const bySubject = new Map<string, any[]>();

		for (const q of quads) {
			const subject = valueOf(q.subject);
			if (!bySubject.has(subject)) {
				bySubject.set(subject, []);
			}
			bySubject.get(subject)!.push(q);
		}

		const shapeSubjects = new Set<string>();
		const propertyShapeSubjects = new Set<string>();

		for (const q of quads) {
			const subject = valueOf(q.subject);
			const predicate = valueOf(q.predicate);
			const object = valueOf(q.object);

			if (predicate === RDF_TYPE && (object === SH_SHAPE || object === SH_NODE_SHAPE)) {
				shapeSubjects.add(subject);
			}
			if (predicate === RDF_TYPE && object === SH_PROPERTY_SHAPE) {
				propertyShapeSubjects.add(subject);
			}
			if (TARGET_PREDICATES.has(predicate)) {
				shapeSubjects.add(subject);
			}
			if (predicate === SH_PROPERTY) {
				shapeSubjects.add(subject);
				propertyShapeSubjects.add(object);
			}
		}

		for (const subject of Array.from(shapeSubjects)) {
			if (propertyShapeSubjects.has(subject)) {
				const hasTarget = (bySubject.get(subject) ?? []).some(q => TARGET_PREDICATES.has(valueOf(q.predicate)));
				if (!hasTarget) {
					shapeSubjects.delete(subject);
				}
			}
		}

		const shapes: ShaclShape[] = [];
		for (const subject of shapeSubjects) {
			const closure = this.collectShapeClosure(subject, bySubject);
			const shapeQuads = Array.from(closure)
				.flatMap(s => bySubject.get(s) ?? [])
				.filter((q, i, arr) => arr.indexOf(q) === i);

			const rootQuads = bySubject.get(subject) ?? [];
			const targets = rootQuads
				.filter(q => TARGET_PREDICATES.has(valueOf(q.predicate)))
				.map((q): ShaclTargetBinding => {
					const predicate = valueOf(q.predicate);
					const object = valueOf(q.object);
					return {
						key: targetKey(predicate, object),
						predicate,
						value: object,
						display: `${shortIri(predicate)} ${shortIri(object)}`,
					};
				});

			const propertyIds = rootQuads
				.filter(q => valueOf(q.predicate) === SH_PROPERTY)
				.map(q => valueOf(q.object));

			const properties = propertyIds.map((id): ShaclPropertyShapeInfo => {
				const propQuads = bySubject.get(id) ?? [];
				const path = valueOf(propQuads.find(q => valueOf(q.predicate) === SH_PATH)?.object);
				const name = firstLiteral(propQuads, id, SH_NAME);
				const desc = firstLiteral(propQuads, id, SH_DESCRIPTION) ?? firstLiteral(propQuads, id, SH_MESSAGE);
				const pathDisplay = path ? shortIri(path) : '(no sh:path)';
				return {
					id,
					path: path || undefined,
					pathDisplay,
					label: name ?? pathDisplay,
					summary: desc ?? pathDisplay,
				};
			});

			shapes.push({
				id: subject,
				subject,
				quads: shapeQuads,
				label: shortIri(subject),
				name: firstLiteral(shapeQuads, subject, SH_NAME),
				description: firstLiteral(shapeQuads, subject, SH_DESCRIPTION) ?? firstLiteral(shapeQuads, subject, SH_MESSAGE),
				targets,
				properties,
			});
		}

		return shapes.sort((a, b) => a.id.localeCompare(b.id));
	}

	private collectShapeClosure(root: string, bySubject: Map<string, any[]>): Set<string> {
		const visited = new Set<string>();
		const stack = [root];

		while (stack.length > 0) {
			const subject = stack.pop()!;
			if (!subject || subject === RDF_NIL || visited.has(subject)) continue;
			visited.add(subject);

			for (const q of bySubject.get(subject) ?? []) {
				const predicate = valueOf(q.predicate);
				const object = valueOf(q.object);
				if (DEPENDENCY_PREDICATES.has(predicate) || termType(q.object) === 'BlankNode') {
					if (bySubject.has(object) && !visited.has(object)) {
						stack.push(object);
					}
				}
				if (predicate === RDF_FIRST || predicate === RDF_REST) {
					if (bySubject.has(object) && !visited.has(object)) {
						stack.push(object);
					}
				}
			}
		}

		return visited;
	}
}
