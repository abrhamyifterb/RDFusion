/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic } from 'vscode-languageserver';

export interface LiteralInfo {
	value: any;
	datatype?: string;
	language?: string;
	range: Diagnostic['range'];
}

export interface TtlValidation {
	readonly key: string;
	init(literals: LiteralInfo[]): void;
	
	run(): Diagnostic[];
}
