import { Connection } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { PrefixRegistry } from '../prefix/prefix-registry';
import { ITermProvider } from './iterm-provider';
import { LocalTermCache } from './local-term-cache.js';
import { RemoteTermCache } from './remote-term-cache.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

export class TermProvider implements ITermProvider {
	private local: LocalTermCache;
	private remote: RemoteTermCache;
	private configSettings: RDFusionConfigSettings;
	constructor(
		dataManager: DataManager,
		prefixRegistry: PrefixRegistry,
		initialSettings: RDFusionConfigSettings
	) {
		this.local  = new LocalTermCache(dataManager);
		this.remote = new RemoteTermCache(prefixRegistry);
		this.configSettings = initialSettings;
	}

	public async init() {
		this.local.rebuild();
	}

	async getTermsFor(prefix: string, connection: Connection): Promise<string[]> {
		const local = this.configSettings.turtle.autocomplete['localBased'] ? this.local.get(prefix) ?? [] : [];
		const remote = this.configSettings.turtle.autocomplete['remoteBased'] ? await this.remote.get(prefix, connection) ?? [] : [];
		
		const combined = [...new Set([...remote, ...local])];
		return combined;
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
