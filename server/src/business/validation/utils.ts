import { Node } from 'jsonc-parser';
import { Diagnostic } from 'vscode-languageserver';
import { Definition } from '../../data/irdf-parser';
import type { ResolvedContext } from '../../data/jsonld/active-context-resolver.js';

export interface ValidationRule {
	readonly key: string;
	init(args: {
		text: string;
		ast: Node;
		contextMap?: Map<string,string>;
		prefixMap?: Map<string,string>;
		vocab?: string;
		definitions?: Definition[];
		resolvedContext?: ResolvedContext;
	}): void;

	run(): Diagnostic[];
}
