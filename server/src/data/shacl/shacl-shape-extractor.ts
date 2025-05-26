/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonldParsedGraph, ParsedGraph } from '../irdf-parser';
import { IShapeExtractor, ShaclShape } from './ishape-extractor';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SHACL_SHAPE = 'http://www.w3.org/ns/shacl#Shape';
const SHACL_NAMESPACE = 'http://www.w3.org/ns/shacl#';
const SHACL_TARGET = SHACL_NAMESPACE + 'targetClass';
const SHACL_PROPERTY = SHACL_NAMESPACE + 'property';
const SHACL_IN = SHACL_NAMESPACE + 'in';
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';

export class ShaclShapeExtractor implements IShapeExtractor {
	extractShapes(parsedGraph: ParsedGraph | JsonldParsedGraph): ShaclShape[] {
		const quads = parsedGraph.quads;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const bySubject = new Map<string, any[]>();
		for (const q of quads) {
			const key = q.subject.value;
			if (!bySubject.has(key)) {
				bySubject.set(key, []);
			}
			bySubject.get(key)!.push(q);
		}

		const shapeSubjects = new Set<string>();
		for (const q of quads) {
		if (
			(q.predicate.value === RDF_TYPE && q.object.value === SHACL_SHAPE)
			|| (q.predicate.value === SHACL_TARGET)
		) {
			shapeSubjects.add(q.subject.value);
		}
		}

		const shapes: ShaclShape[] = [];

		for (const subj of shapeSubjects) {
			const shapeQuads = [...(bySubject.get(subj) ?? [])];
			const propNodes = shapeQuads
				.filter(q => q.predicate.value === SHACL_PROPERTY)
				.map(q => q.object.value);

			for (const node of propNodes) {
				const nodeQuads = bySubject.get(node);
				if (nodeQuads) {
					shapeQuads.push(...nodeQuads);
				}
			}

			const listQuads: any[] = [];
			const visited = new Set<string>();

			function traverseList(node: string) {
				if(!node || visited.has(node) || node === RDF_NIL) {return;}
				visited.add(node);
				const quads = bySubject.get(node) || [];
				for (const quad of quads) {
					if (quad.predicate.value === RDF_FIRST || quad.predicate.value === RDF_REST) {
						listQuads.push(quad);
						traverseList(quad.object.value);
					}
				}
			}

			for (const quad of shapeQuads){
				if(quad.predicate.value === SHACL_IN) {
					listQuads.push(quad);
					traverseList(quad.object.value);
				}
			}
			shapeQuads.push(...listQuads);
			shapes.push({ subject: subj, quads: shapeQuads });
		}
		return shapes;
	}
}
