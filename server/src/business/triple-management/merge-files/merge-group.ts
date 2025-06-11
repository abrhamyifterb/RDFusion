/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataManager } from '../../../data/data-manager';
import { ParsedGraph } from '../../../data/irdf-parser';
import { GroupFormatter } from '../grouping/turtle/group-by-subject';
import { MergeParams } from './merge-and-group-command';


export class MergeGroupService {
	constructor(private dataManager: DataManager) {}

	public async mergeAndGroup(params: MergeParams): Promise<string> {
		const parsedGraphs = await Promise.all(
			params.files.map(file => this.dataManager.parseDocument(file.uri, file.text, file.version))
		);

		const mergedQuads = parsedGraphs.flatMap(parsedGraph => parsedGraph.quads);
		
		const mergedPrefixes: Record<string, string> = {};
		for (const parsedGraph of parsedGraphs) {
			if ('prefixes' in parsedGraph && parsedGraph.prefixes) {
				Object.assign(mergedPrefixes, parsedGraph.prefixes);
			}
			if ('contextMap' in parsedGraph && parsedGraph.contextMap) {
				Object.assign(mergedPrefixes, Object.fromEntries(parsedGraph.contextMap.entries()));
			}
		}

		for (const [pfx, ns] of Object.entries(mergedPrefixes)) {
			if (!ns.endsWith('/') && !ns.endsWith('#')) {
				mergedPrefixes[pfx] = ns + '/';
			}
		}
		
		// console.log(`mergedPrefixes => ${JSON.stringify(mergedPrefixes)}`);
	
		const combined: ParsedGraph = {
			quads: mergedQuads,
			prefixes: mergedPrefixes,
			tokens: []
		};
	
		return new GroupFormatter().group(combined);
	}
}
