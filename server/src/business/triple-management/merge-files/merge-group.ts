import { DataManager } from '../../../data/data-manager';
import { ParsedGraph } from '../../../data/irdf-parser';
import { GroupFormatter } from '../grouping/turtle/group-by-subject';
import { MergeParams } from './merge-and-group-command';


export class MergeGroupService {
	constructor(private dataManager: DataManager) {}

	public async mergeAndGroup(params: MergeParams): Promise<string> {
		const baseParsed  = await this.dataManager.parseDocument(
			params.base.uri, params.base.text, params.base.version
		);
		const mergeParsed = await this.dataManager.parseDocument(
			params.merge.uri, params.merge.text, params.merge.version
		);
	
		const mergedQuads = [
			...baseParsed.quads,
			...mergeParsed.quads
		];
	
		const mergedPrefixes: Record<string,string> = {
			...('prefixes'   in baseParsed  ? baseParsed.prefixes   : {}),
			...('prefixes'   in mergeParsed ? mergeParsed.prefixes  : {}),
			...('contextMap' in baseParsed  ? Object.fromEntries(baseParsed.contextMap.entries())  : {}),
			...('contextMap' in mergeParsed ? Object.fromEntries(mergeParsed.contextMap.entries()) : {})
		};
		
		for (const [pfx, ns] of Object.entries(mergedPrefixes)) {
			if (!ns.endsWith('/') && !ns.endsWith('#')) {
				mergedPrefixes[pfx] = ns + '/';
			}
		}
		
		console.log(`mergedPrefixes => ${JSON.stringify(mergedPrefixes)}`);
	
		const combined: ParsedGraph = {
			quads: mergedQuads,
			prefixes: mergedPrefixes,
			tokens: []
		};
	
		return new GroupFormatter().group(combined);
	}
}
