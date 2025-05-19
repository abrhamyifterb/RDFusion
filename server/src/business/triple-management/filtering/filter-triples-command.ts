import { Connection, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ParsedGraph } from '../../../data/irdf-parser';
import { FilterQuads } from './turtle/filter-triples';
import { GroupFormatter } from '../grouping/turtle/group-by-subject';
import { Quad } from 'n3';


export class FilterTriplesCommand {
	constructor(
		private dataManager: DataManager,
		private connection:  Connection,
	) {}

	public async execute(args: {
		uri: string;
		subjectFilters:   string[];
		predicateFilters: string[];
		objectFilters:    string[];
	}): Promise<string> {
		try {
			const { uri, subjectFilters, predicateFilters, objectFilters } = args;
			const parsed = this.dataManager.getParsedData(uri) as ParsedGraph | undefined;
			if (!parsed) {
				this.connection.console.error(`[Filter] No parsed data for ${uri}`);
				return '';
			}

			const filteredQuads = FilterQuads.apply(
				parsed.quads,
				subjectFilters,
				predicateFilters,
				objectFilters,
				parsed.prefixes || {}
			);
			if (filteredQuads.length === 0) return '';
			
			const filteredPrefixes = usedPrefixes(filteredQuads, parsed.prefixes);

			const fragment: ParsedGraph = {
				quads: filteredQuads || [],
				prefixes: filteredPrefixes,
				tokens: []
			};

			const groupedTurtle = new GroupFormatter().group(fragment);
			
			return groupedTurtle;
		} catch (e:any)	{
			console.error("FilterTriples errors: " + e);
			return '';
		}
	}
}


function usedPrefixes(
	quads: Quad[],
	prefixes: Record<string,string> = {}
): Record<string,string> {
	const used = new Set<string>();
	for (const q of quads) {
		const record = (iri: string) => {
			for (const [pfx, base] of Object.entries(prefixes)) {
				if (iri.startsWith(base)) {
					used.add(pfx);
				}
			}
		};

		record(q.subject.value);
		record(q.predicate.value);
		
		if (q.object.termType === 'NamedNode') {
			record(q.object.value);
		} else if (q.object.termType === 'Literal') {
			const dt = (q.object as any).datatype?.value;
			if (dt) record(dt);
		}
	}
	const usedPrefixes: Record<string,string> = {};
	for (const pfx of used) {
		usedPrefixes[pfx] = prefixes[pfx];
	}
	return usedPrefixes;
}
