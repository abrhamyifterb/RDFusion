/* eslint-disable @typescript-eslint/no-explicit-any */
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { TextDocuments } from 'vscode-languageserver/node';
import { parseTree, Node } from 'jsonc-parser';

export const makeDoc = (uri: string, languageId: string, text: string) =>
  TextDocument.create(uri, languageId, 1, text);

export const asDocs = (doc: TextDocument) =>
  ({ get: () => doc } as unknown as TextDocuments<TextDocument>);

export const parseAst = (text: string): Node => parseTree(text)!;
