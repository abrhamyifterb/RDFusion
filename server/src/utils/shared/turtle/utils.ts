import { Range, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Token } from './tokenizer';

export function tokenToRange(tok: Token): Range {
	return Range.create(
		(tok.startLine  || 1) - 1,
		(tok.startColumn|| 1) - 1,
		(tok.endLine    || tok.startLine  || 1) - 1,
		(tok.endColumn || tok.startColumn|| 1) - 1
	);
}

export function makeDiag(tok: Token, message: string, severity: DiagnosticSeverity) {
	return Diagnostic.create(tokenToRange(tok), message, severity);
}
