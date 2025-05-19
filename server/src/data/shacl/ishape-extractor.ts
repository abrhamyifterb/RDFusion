/* eslint-disable @typescript-eslint/no-explicit-any */
import { JsonldParsedGraph, ParsedGraph } from '../irdf-parser';

export interface ShaclShape {
	subject: string;  
	quads: any[];     
}

export interface IShapeExtractor {
	extractShapes(parsedGraph: ParsedGraph | JsonldParsedGraph): ShaclShape[];
}
