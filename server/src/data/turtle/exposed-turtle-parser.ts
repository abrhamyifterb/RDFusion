import pkg from 'millan';
import type { TurtleComment } from '../irdf-parser.js';
const { TurtleParser } = pkg;

export class ExposedTurtleParser extends TurtleParser {
	public getCommentTokens(input: string): TurtleComment[] {
		const result = this.lexer.tokenize(input);
		return (result.groups.comments ?? []).map(token => ({
			image: token.image,
			startOffset: token.startOffset,
			endOffset: token.endOffset ?? token.startOffset + token.image.length - 1,
			startLine: token.startLine ?? 1,
			endLine: token.endLine ?? token.startLine ?? 1,
			startColumn: token.startColumn ?? 1,
			endColumn: token.endColumn ?? (token.startColumn ?? 1) + token.image.length - 1,
		}));
	}

	public getBase(): string | null {
		if (typeof this.base === 'function') {
		const result = this.base();
		return typeof result === 'string' ? result : null;
		}
		return (this.base as unknown) as string | null;
	}
	
	public getNamespacesMap(): Record<string, string> {
		return this.namespacesMap;
	}
}
