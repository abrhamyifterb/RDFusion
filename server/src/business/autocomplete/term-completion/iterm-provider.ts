import { Connection } from 'vscode-languageserver';

export interface ITermProvider {
	init(): Promise<void>;
	getTermsFor(prefix: string, connection: Connection, namespaceIri?: string, syntax?: 'turtle' | 'jsonld'): Promise<string[]>;
}
