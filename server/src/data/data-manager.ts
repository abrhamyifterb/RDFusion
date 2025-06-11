/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection } from 'vscode-languageserver/node.js';
import { CachedParsedGraph, JsonldParsedGraph, ParsedGraph } from './irdf-parser';
import { RDFParser } from './rdf-parser.js';
import { Cache } from './cache/lru-cache';

export class DataManager {
	private parsedData = new Map<string, CachedParsedGraph>();
	private rdfParser: RDFParser;

	constructor(
		private cache: Cache<string, CachedParsedGraph>,
		private connection: Connection,
	) {
		this.rdfParser = new RDFParser();
	}

	findFileFormat(uri: string): string {
		return uri.toLowerCase().endsWith(".ttl") ? "turtle" : uri.toLowerCase().endsWith(".jsonld") ? "jsonld" : "unknown";
	}

	async parseDocument(uri: string, text: string, version: number): Promise<ParsedGraph | JsonldParsedGraph> {
		const cached = this.parsedData.get(uri);
		if (cached && cached.version === version) {
			return cached.parsedGraph;
		}

		let fileType = "";
		if (!fileType) {
			fileType = this.findFileFormat(uri);
		}
		
		let parsedGraph: ParsedGraph | JsonldParsedGraph;
		
		try {
			parsedGraph = await this.rdfParser.parse(text, fileType);
		} catch (error: any) {
			this.connection.console.error(`[Data Manager]: Error parsing ${uri}: ${error.message}`);
			console.error(`Error parsing ${uri}: ${error.message}`);
			throw new Error(`Parsing error for ${uri}: ${error.message}`);
		}
		
		const cacheEntry: CachedParsedGraph = { version, parsedGraph };

		this.parsedData.set(uri, cacheEntry);
		this.cache.set(uri, cacheEntry);

		// console.log(`Parsed and cached ${uri} (version ${version})`);
		return parsedGraph;
	}

	getAllParsedData(): Map<string, CachedParsedGraph> {
		return this.parsedData;
	}

	getParsedData(uri: string): ParsedGraph | JsonldParsedGraph | undefined {
		const cached = this.parsedData.get(uri);
		return cached ? cached.parsedGraph : undefined;
	}
}
