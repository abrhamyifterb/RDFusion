import { Position, Range, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DataManager } from '../../data/data-manager.js';
import { JsonldParsedGraph, ParsedGraph } from '../../data/irdf-parser';

export type CommandParsedGraph = ParsedGraph | JsonldParsedGraph;

export async function getParsedGraphForCommand(
  dataManager: DataManager,
  documents: TextDocuments<TextDocument>,
  uri: string,
): Promise<CommandParsedGraph | undefined> {
  const doc = documents.get(uri);
  const snapshot = dataManager.getSnapshot(uri);

  if (snapshot && (!doc || snapshot.version === doc.version)) {
    return snapshot.parsedGraph;
  }

  if (!doc) {
    return snapshot?.parsedGraph;
  }

  return dataManager.parseDocument(uri, doc.getText(), doc.version, doc.languageId);
}

export function hasParseDiagnostics(parsed: CommandParsedGraph): boolean {
  return (
    ('errors' in parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0) ||
    ('diagnostics' in parsed && Array.isArray(parsed.diagnostics) && parsed.diagnostics.length > 0)
  );
}

export function fullDocumentRange(doc: TextDocument): Range {
  const text = doc.getText();
  const lastLine = Math.max(0, doc.lineCount - 1);
  const lastLineStart = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
  const lastCol = lastLineStart >= 0 ? text.length - lastLineStart - 1 : text.length;
  return {
    start: Position.create(0, 0),
    end: Position.create(lastLine, Math.max(0, lastCol)),
  };
}
