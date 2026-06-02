import { Diagnostic } from 'vscode-languageserver/node.js';
import { ShaclValidator } from './shacl-validator';
import { ShaclSelectionSettings } from '../../data/shacl/shacl-selection';

export interface IRdfValidator {
	validate(uri: string, shaclValidator: ShaclValidator, shaclSelection: ShaclSelectionSettings): Promise<Diagnostic[]>;
}
