import { Connection } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { PrefixRegistry } from '../prefix/prefix-registry';
import { ITermProvider } from './iterm-provider';
import { LocalTermCache, LocalTermInfo } from './local-term-cache.js';
import { RemoteTermCache, RemoteTermInfo } from './remote-term-cache.js';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

export class TermProvider implements ITermProvider {
	private local: LocalTermCache;
	private remote: RemoteTermCache;
	private configSettings: RDFusionConfigSettings;
	constructor(
		dataManager: DataManager,
		private readonly prefixRegistry: PrefixRegistry,
		initialSettings: RDFusionConfigSettings
	) {
		this.local  = new LocalTermCache(dataManager, prefixRegistry);
		this.remote = new RemoteTermCache(prefixRegistry);
		this.configSettings = initialSettings;
	}

	public async init() {
		this.local.rebuild();
	}

	public updateLocalTermsForUri(uri: string): void {
		this.local.updateUri(uri);
	}

	public removeLocalTermsForUri(uri: string): void {
		this.local.removeUri(uri);
	}

	public getLocalTermInfo(prefix: string, term: string): LocalTermInfo | undefined {
		return this.local.getInfo(prefix, term);
	}

	private splitIriForLookup(iri: string): { prefix: string; term: string; namespaceIri: string } | undefined {
		const prefix = this.prefixRegistry.getPrefix(iri);
		const namespaceIri = prefix ? this.prefixRegistry.getIri(prefix) : undefined;
		if (prefix && namespaceIri && iri.startsWith(namespaceIri)) {
			const term = iri.slice(namespaceIri.length);
			if (term) {
				return { prefix, term, namespaceIri };
			}
		}

		const hash = iri.lastIndexOf('#');
		const slash = iri.lastIndexOf('/');
		const sep = Math.max(hash, slash);
		if (sep < 0 || sep === iri.length - 1) {
			return undefined;
		}

		return {
			prefix: '@iri',
			term: iri.slice(sep + 1),
			namespaceIri: iri.slice(0, sep + 1),
		};
	}

	public getRemoteTermInfo(prefix: string, term: string, namespaceIri?: string, syntax?: 'turtle' | 'jsonld'): RemoteTermInfo | undefined {
		return this.remoteAccessEnabled(syntax) ? this.remote.getInfo(prefix, term, namespaceIri) : undefined;
	}

	public getRemoteTermInfoByIri(iri: string, syntax?: 'turtle' | 'jsonld'): RemoteTermInfo | undefined {
		if (!this.remoteAccessEnabled(syntax)) {
			return undefined;
		}
		const parts = this.splitIriForLookup(iri);
		return parts ? this.remote.getInfo(parts.prefix, parts.term, parts.namespaceIri) : undefined;
	}

	public getCachedRemoteTermsForPrefix(prefix: string, namespaceIri?: string, syntax?: 'turtle' | 'jsonld'): Set<string> | undefined {
		return this.remoteAccessEnabled(syntax) ? this.remote.getCachedTermsForPrefix(prefix, namespaceIri) : undefined;
	}

	public getKnownTermsForPrefix(prefix: string): Set<string> {
		const combined = new Set<string>();
		if (this.configSettings.turtle.autocomplete['localBased']) {
			for (const term of this.local.get(prefix) ?? []) combined.add(term);
		}
		if (this.configSettings.turtle.autocomplete['remoteBased']) {
			for (const term of this.remote.getCachedTermsForPrefix(prefix) ?? []) combined.add(term);
		}
		return combined;
	}

	public async ensureRemoteTermInfo(prefix: string, term: string, namespaceIri?: string, syntax?: 'turtle' | 'jsonld'): Promise<RemoteTermInfo | undefined> {
		return this.remoteAccessEnabled(syntax) ? await this.remote.ensureInfo(prefix, term, namespaceIri) : undefined;
	}

	public async ensureRemoteTermInfoByIri(iri: string, syntax?: 'turtle' | 'jsonld'): Promise<RemoteTermInfo | undefined> {
		if (!this.remoteAccessEnabled(syntax)) {
			return undefined;
		}
		const parts = this.splitIriForLookup(iri);
		return parts ? await this.remote.ensureInfo(parts.prefix, parts.term, parts.namespaceIri) : undefined;
	}

	public async prefetchRemoteTermsForPrefix(prefix: string, connection: Connection, namespaceIri?: string, syntax?: 'turtle' | 'jsonld'): Promise<void> {
		if (!this.remoteAccessEnabled(syntax)) return;
		await this.remote.prefetchPrefix(prefix, connection, namespaceIri, { silent: true });
	}

	async getTermsFor(prefix: string, connection: Connection, namespaceIri?: string, syntax: 'turtle' | 'jsonld' = 'turtle'): Promise<string[]> {
		const autocomplete = this.configSettings[syntax]?.autocomplete ?? {};
		const local = autocomplete['localBased'] ? this.local.get(prefix) ?? [] : [];
		const remote = autocomplete['remoteBased'] ? await this.remote.get(prefix, connection, namespaceIri) ?? [] : [];
		
		const combined = [...new Set([...remote, ...local])];
		return combined;
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}

	private remoteAccessEnabled(syntax?: 'turtle' | 'jsonld'): boolean {
		if (syntax) {
			return this.configSettings[syntax]?.autocomplete?.['remoteBased'] === true
				|| this.configSettings[syntax]?.validations?.['remoteTermVocabulary'] !== false;
		}
		return this.remoteAccessEnabled('turtle') || this.remoteAccessEnabled('jsonld');
	}
}
