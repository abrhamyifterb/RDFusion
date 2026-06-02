/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { JsonldParsedGraph, ParsedGraph } from '../../../data/irdf-parser';
import { FilterQuads } from './turtle/filter-triples';
import { TurtleFilterCommand } from './turtle/turtle-filter-command';
import { JsonldFilterCommand } from './jsonld/jsonld-filter-command';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getParsedGraphForCommand, hasParseDiagnostics } from '../parsed-document-helper.js';

export class FilterTriplesCommand {
	constructor(
		private dataManager: DataManager,
		private connection:  Connection,
		private documents?: TextDocuments<TextDocument>,
	) {}

	public async execute(args: {
		uri: string;
		subjectFilters?:   string[];
		predicateFilters?: string[];
		objectFilters?:    string[];
	}): Promise<string> {
		try {

			const { 
				uri, 
				subjectFilters = [], 
				predicateFilters = [], 
				objectFilters = [] 
			} = args;

			const typeofuri = uri.toLowerCase().endsWith(".ttl") ? "turtle" : uri.toLowerCase().endsWith(".jsonld") ? "jsonld" : "unknown";
			if (typeofuri === "unknown") {
				return "";
			}

			const parsed = this.documents
				? await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | JsonldParsedGraph | undefined
				: this.dataManager.getGraphSnapshot(uri) as ParsedGraph | JsonldParsedGraph | undefined;
			
			if (!parsed) {
				this.connection.console.error(`[Filter] Could not filter because no parsed RDF data is available for ${uri}`);
				return '';
			}

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[Filter] Could not filter because the RDF document has parse errors: ${uri}`);
				return '';
			}

			const mergedPrefixes: Record<string, string> = {};
			if ('prefixes' in parsed && parsed.prefixes) {
				Object.assign(mergedPrefixes, parsed.prefixes);
			}
			if ('contextMap' in parsed && parsed.contextMap) {
				Object.assign(mergedPrefixes, Object.fromEntries(parsed.contextMap.entries()));
			}
			
	
			for (const [pfx, ns] of Object.entries(mergedPrefixes)) {
				if (!ns.endsWith('/') && !ns.endsWith('#')) {
					mergedPrefixes[pfx] = ns + '/';
				}
			}

			const filteredQuads = FilterQuads.apply(
				parsed.quads,
				subjectFilters,
				predicateFilters,
				objectFilters,
				mergedPrefixes || {}
			);
			if (filteredQuads.length === 0) {
				return '';
			}
			

			if (typeofuri === 'turtle') {
				return new TurtleFilterCommand().filter(filteredQuads, mergedPrefixes);
			} else {
				return await new JsonldFilterCommand().format(filteredQuads);
			}
			
		} catch (error:any)	{
			this.connection.console.error(`[Filter] Failed to filter triples: ${error.message || error.toString()}`);
			console.error(`[Filter] Failed to filter triples: ${error.message || error.toString()}`);
			return '';
		}
	}
}