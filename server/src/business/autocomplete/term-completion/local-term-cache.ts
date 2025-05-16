import { DataManager } from '../../../data/data-manager';

export class LocalTermCache {
	private terms = new Map<string, Set<string>>();

	constructor(private dataManager: DataManager) {}

	public rebuild(): void {
		this.terms.clear();
		const allGraphs = this.dataManager.getAllParsedData();

		for (const [, cached] of allGraphs.entries()) {
			const parsed = cached.parsedGraph;

			if ('tokens' in parsed) {
				for(const token of parsed.tokens){
					const mapping = parsed.prefixes || {};
					const [pfx, term] = token.image.split(':');
					if (mapping[pfx]) {
						this.add(pfx, term);
					}
				}
			} 

			else if ('definitions' in parsed) {
				for (const def of parsed.definitions) {
					const [pfx, local] = def.id.split(':');
					if (parsed.contextMap.has(pfx)) {this.add(pfx, local);}
				}
			}
		}
	}

	private add(prefix: string, term: string) {
		if (!this.terms.has(prefix)) {
			this.terms.set(prefix, new Set());
		}
		this.terms.get(prefix)!.add(term);
	}

	public get(prefix: string): Set<string> | undefined {
		return this.terms.get(prefix);
	}
}