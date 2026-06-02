import { Range } from 'vscode-languageserver/node.js';

export interface TurtleTokenRangeLike {
  image?: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Convert Turtle/Chevrotain token coordinates to an LSP range.
 *
 * Chevrotain token positions are 1-based. Its endColumn is inclusive, while
 * LSP ranges are 0-based and end-exclusive. For tokens with an image, deriving
 * the end position from the actual token text is safest and prevents quick fixes
 * from replacing one character too few.
 */
export function tokenToLspRange(token: TurtleTokenRangeLike | undefined): Range {
  const startLine = Math.max(0, (token?.startLine ?? 1) - 1);
  const startCharacter = Math.max(0, (token?.startColumn ?? 1) - 1);

  if (typeof token?.image === 'string') {
    const lines = token.image.split(/\r\n|\r|\n/);
    if (lines.length === 1) {
      return Range.create(startLine, startCharacter, startLine, startCharacter + token.image.length);
    }

    return Range.create(
      startLine,
      startCharacter,
      startLine + lines.length - 1,
      lines[lines.length - 1]?.length ?? 0,
    );
  }

  const endLine = Math.max(0, (token?.endLine ?? token?.startLine ?? 1) - 1);
  const endCharacter = Math.max(0, token?.endColumn ?? token?.startColumn ?? 1);
  return Range.create(startLine, startCharacter, endLine, endCharacter);
}
