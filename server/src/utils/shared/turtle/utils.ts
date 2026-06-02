import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { Token } from './tokenizer';
import { tokenToLspRange } from './range.js';

export function tokenToRange(tok: Token): Range {
	return tokenToLspRange(tok);
}

export function makeDiag(tok: Token, message: string, severity: DiagnosticSeverity) {
	return Diagnostic.create(tokenToRange(tok), message, severity);
}
