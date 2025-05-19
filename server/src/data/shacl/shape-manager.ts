import { Connection } from 'vscode-languageserver/node.js';
import { IShapeExtractor, ShaclShape } from './ishape-extractor';
import { ShaclShapeExtractor } from './shacl-shape-extractor.js';
import { JsonldParsedGraph, ParsedGraph } from '../irdf-parser';
import { DataManager } from '../data-manager';

export class ShapeManager {
	private shapeIndex = new Map<string, ShaclShape[]>();
	private shapeExtractor: IShapeExtractor;

	constructor(private connection: Connection) {
		this.shapeExtractor = new ShaclShapeExtractor();
	}

	updateShapeIndex(uri: string, parsedGraph: ParsedGraph | JsonldParsedGraph): void {
		const shapes = this.shapeExtractor.extractShapes(parsedGraph);
		if (shapes.length > 0) {
			this.shapeIndex.set(uri, shapes);
		} else if (this.shapeIndex.has(uri)) {
			this.shapeIndex.delete(uri);
		}
	}
	
	refreshGlobalIndex(dataManager: DataManager): void {
		for (const [uri, cached] of dataManager.getAllParsedData()) {
			this.updateShapeIndex(uri, cached.parsedGraph);
		}
	}

	getGlobalShapes(): ShaclShape[] {
		let allShapes: ShaclShape[] = [];
		for (const shapes of this.shapeIndex.values()) {
			allShapes = allShapes.concat(shapes);
		}
		return allShapes;
	}
}
