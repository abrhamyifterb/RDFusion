/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonldParsedGraph, ParsedGraph } from '../irdf-parser';

export interface ShaclTargetBinding {
	key: string;
	predicate: string;
	value: string;
	display: string;
}

export interface ShaclPropertyShapeInfo {
	id: string;
	path?: string;
	pathDisplay: string;
	label: string;
	summary: string;
}

export interface ShaclShape {
	id: string;
	subject: string;
	sourceUri?: string;
	quads: any[];
	label?: string;
	name?: string;
	description?: string;
	targets: ShaclTargetBinding[];
	properties: ShaclPropertyShapeInfo[];
}

export interface IShapeExtractor {
	extractShapes(parsedGraph: ParsedGraph | JsonldParsedGraph): ShaclShape[];
}
