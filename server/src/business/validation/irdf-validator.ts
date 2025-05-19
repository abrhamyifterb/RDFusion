import { Diagnostic } from 'vscode-languageserver/node.js';
import { ShaclValidator } from './shacl-validator';

export interface IRdfValidator {
	validate(uri: string, shaclValidator:ShaclValidator): Promise<Diagnostic[]>;
}