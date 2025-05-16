import { Cache } from './cache.js';
import { IFetcher } from './ifetcher';

export class PrefixRegistry {
	private prefixMap = new Cache(); 

	constructor(private fetcher: IFetcher) { 
		this.preloadPrefixes(); 
	}

	private async preloadPrefixes() {
		try {
			const data = await this.fetcher.getPrefixes<Record<string,string>>(
				'https://prefix.cc/popular/all.file.json'
			);
			for (const [p,iri] of Object.entries(data)) {
				this.prefixMap.set(p, iri);
			}
		} catch { 
			console.log("Something went wrong with fetching from prefix.cc ...");
		}
	}

	public async ensure(prefix: string): Promise<string|undefined> {
		// console.dir(`Prefix check => ${JSON.stringify(this.prefixMap.getAll())}`);
		if (this.prefixMap.has(prefix)) {
			return this.prefixMap.get(prefix)!;
		}
		// console.dir(`Prefix: ${prefix} not found => ${JSON.stringify(this.prefixMap.getAll())}`);
		try {
			const data = await this.fetcher.getPrefixes<Record<string,string>>(
				`https://prefix.cc/${prefix}.file.json`
			);
			const iri  = (data[prefix]||"");
			if (iri) {
				this.prefixMap.set(prefix, iri);
				return iri;
			}
		} catch { 
			// console.log(`Something went wrong with fetching ${prefix} from prefix.cc ...`); 
			return;
		}
	}

	public getAll(): {prefix:string, iri:string}[] {
		return this.prefixMap.getAll();
	}
}
