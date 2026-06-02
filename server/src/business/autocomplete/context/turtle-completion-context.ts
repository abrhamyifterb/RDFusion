import type { Position } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export type TurtleCompletionRole = 'subject' | 'predicate' | 'object' | 'prefix' | 'directive' | 'literal' | 'comment' | 'unknown';

export interface TurtleCompletionContext {
  role: TurtleCompletionRole;
  inPrefixDeclaration: boolean;
  inComment: boolean;
  inLiteral: boolean;
  currentToken: string;
  tokenPrefix?: string;
  tokenFragment?: string;
  statementText: string;
  tokensBeforeCursor: string[];
}

interface ScanState {
  inString: false | 'single' | 'double';
  tripleQuote: boolean;
  inIri: boolean;
  inComment: boolean;
  escaped: boolean;
}


function isTokenChar(value: string): boolean {
  return /[A-Za-z0-9_:.-]/.test(value);
}

function stripCommentOutsideStrings(line: string): string {
  let quote: false | 'single' | 'double' = false;
  let escaped = false;
  let inIri = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if ((quote === 'single' && ch === "'") || (quote === 'double' && ch === '"')) {
        quote = false;
      }
      continue;
    }
    if (inIri) {
      if (ch === '>') inIri = false;
      continue;
    }
    if (ch === '<') {
      inIri = true;
      continue;
    }
    if (ch === '"') {
      quote = 'double';
      continue;
    }
    if (ch === "'") {
      quote = 'single';
      continue;
    }
    if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

function lineHasCommentAt(line: string, character: number): boolean {
  return stripCommentOutsideStrings(line.slice(0, character)).length < line.slice(0, character).length;
}

function getCurrentToken(linePrefix: string): string {
  let start = linePrefix.length;
  while (start > 0 && isTokenChar(linePrefix[start - 1])) {
    start--;
  }
  const token = linePrefix.slice(start);
  return token.includes(':') ? token : token;
}

function getTokenParts(token: string): Pick<TurtleCompletionContext, 'tokenPrefix' | 'tokenFragment'> {
  const match = token.match(/^([A-Za-z_][\w-]*):([\w-]*)$/);
  if (!match) return {};
  return { tokenPrefix: match[1], tokenFragment: match[2] ?? '' };
}

function findStatementStart(text: string, offset: number): number {
  const state: ScanState = {
    inString: false,
    tripleQuote: false,
    inIri: false,
    inComment: false,
    escaped: false,
  };
  let lastBoundary = 0;
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    const next2 = text.slice(i, i + 3);

    if (state.inComment) {
      if (ch === '\n' || ch === '\r') state.inComment = false;
      continue;
    }

    if (state.inString) {
      if (state.escaped) {
        state.escaped = false;
        continue;
      }
      if (ch === '\\') {
        state.escaped = true;
        continue;
      }
      const quoteChar = state.inString === 'double' ? '"' : "'";
      if (state.tripleQuote && next2 === quoteChar.repeat(3)) {
        state.inString = false;
        state.tripleQuote = false;
        i += 2;
        continue;
      }
      if (!state.tripleQuote && ch === quoteChar) {
        state.inString = false;
      }
      continue;
    }

    if (state.inIri) {
      if (ch === '>') state.inIri = false;
      continue;
    }

    if (ch === '#') {
      state.inComment = true;
      continue;
    }
    if (ch === '<') {
      state.inIri = true;
      continue;
    }
    if (next2 === '"""' || next2 === "'''") {
      state.inString = next2[0] === '"' ? 'double' : 'single';
      state.tripleQuote = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      state.inString = ch === '"' ? 'double' : 'single';
      state.tripleQuote = false;
      continue;
    }
    if (ch === '.') {
      lastBoundary = i + 1;
    }
  }
  return lastBoundary;
}

function isInStringAt(text: string, offset: number): boolean {
  const state: ScanState = {
    inString: false,
    tripleQuote: false,
    inIri: false,
    inComment: false,
    escaped: false,
  };
  for (let i = 0; i < offset; i++) {
    const ch = text[i];
    const next2 = text.slice(i, i + 3);
    if (state.inComment) {
      if (ch === '\n' || ch === '\r') state.inComment = false;
      continue;
    }
    if (state.inString) {
      if (state.escaped) {
        state.escaped = false;
        continue;
      }
      if (ch === '\\') {
        state.escaped = true;
        continue;
      }
      const quoteChar = state.inString === 'double' ? '"' : "'";
      if (state.tripleQuote && next2 === quoteChar.repeat(3)) {
        state.inString = false;
        state.tripleQuote = false;
        i += 2;
        continue;
      }
      if (!state.tripleQuote && ch === quoteChar) state.inString = false;
      continue;
    }
    if (state.inIri) {
      if (ch === '>') state.inIri = false;
      continue;
    }
    if (ch === '#') {
      state.inComment = true;
      continue;
    }
    if (ch === '<') {
      state.inIri = true;
      continue;
    }
    if (next2 === '"""' || next2 === "'''") {
      state.inString = next2[0] === '"' ? 'double' : 'single';
      state.tripleQuote = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      state.inString = ch === '"' ? 'double' : 'single';
      state.tripleQuote = false;
    }
  }
  return !!state.inString;
}

function tokenizeStatement(statement: string): string[] {
  const withoutComments = statement
    .split(/\r?\n/)
    .map(stripCommentOutsideStrings)
    .join('\n');
  const tokens: string[] = [];
  let i = 0;
  while (i < withoutComments.length) {
    const ch = withoutComments[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (';,[]()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    if (ch === '<') {
      let end = i + 1;
      while (end < withoutComments.length && withoutComments[end] !== '>') end++;
      tokens.push(withoutComments.slice(i, Math.min(end + 1, withoutComments.length)));
      i = Math.min(end + 1, withoutComments.length);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const triple = withoutComments.slice(i, i + 3) === quote.repeat(3);
      let end = i + (triple ? 3 : 1);
      let escaped = false;
      while (end < withoutComments.length) {
        const current = withoutComments[end];
        if (escaped) {
          escaped = false;
        } else if (current === '\\') {
          escaped = true;
        } else if (triple && withoutComments.slice(end, end + 3) === quote.repeat(3)) {
          end += 3;
          break;
        } else if (!triple && current === quote) {
          end++;
          break;
        }
        end++;
      }
      tokens.push(withoutComments.slice(i, end));
      i = end;
      continue;
    }
    let end = i;
    while (end < withoutComments.length && !/\s/.test(withoutComments[end]) && !';,[]()'.includes(withoutComments[end])) {
      end++;
    }
    tokens.push(withoutComments.slice(i, end));
    i = end;
  }
  return tokens.filter(Boolean);
}

function removePartialCurrentToken(tokens: string[], currentToken: string): string[] {
  if (!currentToken || tokens.length === 0) return tokens;
  const last = tokens[tokens.length - 1];
  return last === currentToken ? tokens.slice(0, -1) : tokens;
}

function roleFromTokens(tokens: string[]): TurtleCompletionRole {
  if (tokens.length === 0) return 'subject';

  let subjectSeen = false;
  let predicateSeen = false;
  let objectSeen = false;

  for (const token of tokens) {
    if (!subjectSeen) {
      if (token === '[' || token === '(') {
        subjectSeen = true;
        predicateSeen = false;
        objectSeen = false;
        continue;
      }
      if (![';', ',', ']', ')'].includes(token)) {
        subjectSeen = true;
        continue;
      }
    }

    if (token === ';') {
      predicateSeen = false;
      objectSeen = false;
      continue;
    }
    if (token === ',') {
      objectSeen = false;
      continue;
    }
    if (token === '[' || token === '(') {
      if (predicateSeen && !objectSeen) objectSeen = true;
      continue;
    }
    if (token === ']' || token === ')') {
      if (predicateSeen && !objectSeen) objectSeen = true;
      continue;
    }
    if (!predicateSeen) {
      predicateSeen = true;
      continue;
    }
    if (!objectSeen) {
      objectSeen = true;
      continue;
    }
  }

  if (!subjectSeen) return 'subject';
  if (!predicateSeen) return 'predicate';
  if (!objectSeen) return 'object';
  return 'unknown';
}

export class TurtleCompletionContextResolver {
  resolve(document: TextDocument, position: Position): TurtleCompletionContext {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const lineStart = document.offsetAt({ line: position.line, character: 0 });
    const nextLineStart = position.line + 1 < document.lineCount
      ? document.offsetAt({ line: position.line + 1, character: 0 })
      : text.length;
    const line = text.slice(lineStart, nextLineStart).replace(/\r?\n$/, '');
    const linePrefix = line.slice(0, position.character);
    const currentToken = getCurrentToken(linePrefix);
    const currentParts = getTokenParts(currentToken);
    const prefixDeclaration = /^\s*(?:@prefix|PREFIX)\s+/i.test(linePrefix) || /^\s*(?:@base|BASE)\s+/i.test(linePrefix);
    const comment = lineHasCommentAt(line, position.character);
    const literal = isInStringAt(text, offset);
    const statementStart = findStatementStart(text, offset);
    const statementText = text.slice(statementStart, offset);
    const tokensBeforeCursor = removePartialCurrentToken(tokenizeStatement(statementText), currentToken);

    let role: TurtleCompletionRole;
    if (comment) {
      role = 'comment';
    } else if (literal) {
      role = 'literal';
    } else if (prefixDeclaration) {
      role = 'prefix';
    } else {
      role = roleFromTokens(tokensBeforeCursor);
    }

    return {
      role,
      inPrefixDeclaration: prefixDeclaration,
      inComment: comment,
      inLiteral: literal,
      currentToken,
      ...currentParts,
      statementText,
      tokensBeforeCursor,
    };
  }
}
