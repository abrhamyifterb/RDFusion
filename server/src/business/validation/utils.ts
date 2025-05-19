import { Node } from 'jsonc-parser';
import { Diagnostic } from 'vscode-languageserver';
import { Definition } from '../../data/irdf-parser';

export interface ValidationRule {
	readonly key: string;
	init(args: {
		text: string;
		ast: Node;
		contextMap?: Map<string,string>;
		definitions?: Definition[];
	}): void;

	run(): Diagnostic[];
}
