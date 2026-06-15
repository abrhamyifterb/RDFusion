import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  Position,
  TextDocuments,
  TextEdit,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseTree } from 'jsonc-parser';
import { PrefixRegistry } from '../autocomplete/prefix/prefix-registry.js';
import { buildJsonLdPrefixContextEdits } from '../../utils/shared/jsonld/context-edit.js';

const KNOWN_UNDEFINED_PREFIX_CODES = new Set([
  'undefinedPrefix',
  'invalidIriCheck',
  'turtleParseError',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractUndefinedPrefix(diagnostic: Diagnostic): string | undefined {
  const dataPrefix = (diagnostic.data as { prefix?: unknown } | undefined)?.prefix;
  if (typeof dataPrefix === 'string' && dataPrefix.trim()) {
    return dataPrefix.trim().replace(/:$/, '');
  }

  const code = String(diagnostic.code ?? '');
  const message = diagnostic.message ?? '';
  if (!KNOWN_UNDEFINED_PREFIX_CODES.has(code) && !/\b(?:undefined|undeclared)\s+prefix\b/i.test(message)) {
    return undefined;
  }

  const patterns = [
    /\b(?:undefined|undeclared)\s+prefix\s+["']([^"']+)["']/i,
    /\b(?:undefined|undeclared)\s+prefix\s*:\s*([A-Za-z_][A-Za-z0-9_.-]*)/i,
    /\b(?:undefined|undeclared)\s+prefix\s+([A-Za-z_][A-Za-z0-9_.-]*)/i,
    /\bprefix\s+["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s+(?:is\s+)?(?:not\s+defined|undefined|undeclared|not\s+recognized)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    const raw = match?.[1]?.trim().replace(/[:.,;]+$/, '');
    if (raw) return raw;
  }

  return undefined;
}

function lineText(doc: TextDocument, line: number): string {
  return doc.getText({
    start: Position.create(line, 0),
    end: Position.create(line, Number.MAX_SAFE_INTEGER),
  });
}

function turtlePrefixEdit(doc: TextDocument, prefix: string, iri: string): TextEdit[] {
  const text = doc.getText();
  const prefixPattern = new RegExp(`^\\s*(?:@prefix|PREFIX)\\s+${escapeRegExp(prefix)}:`, 'im');
  if (prefixPattern.test(text)) return [];

  let insertLine = 0;
  for (let i = 0; i < doc.lineCount; i++) {
    const trimmed = lineText(doc, i).trim();
    if (/^(?:@prefix|PREFIX|@base|BASE)\b/i.test(trimmed)) {
      insertLine = i + 1;
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    break;
  }

  return [
    TextEdit.insert(
      Position.create(insertLine, 0),
      `@prefix ${prefix}: <${iri}> .\n`,
    ),
  ];
}

function jsonldContextEdits(doc: TextDocument, prefix: string, iri: string, diagnostic: Diagnostic): TextEdit[] {
  const text = doc.getText();
  const ast = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  if (!ast) return [];

  return buildJsonLdPrefixContextEdits(
    doc,
    ast,
    prefix,
    iri,
    doc.offsetAt(diagnostic.range.start),
    'nearest',
  );
}

function generatedNamespace(prefix: string): string {
  return `https://example.org/${prefix}#`;
}

export class PrefixDeclarationCodeActionProvider {
  constructor(
    private registry: PrefixRegistry,
    private documents: TextDocuments<TextDocument>,
  ) {}

  public async provideCodeActions(params: CodeActionParams): Promise<CodeAction[]> {
    const doc = this.documents.get(params.textDocument.uri);
    if (!doc) return [];

    const actions: CodeAction[] = [];
    const seen = new Set<string>();

    for (const diagnostic of params.context.diagnostics ?? []) {
      const prefix = extractUndefinedPrefix(diagnostic);
      if (!prefix || seen.has(prefix)) continue;
      seen.add(prefix);

      const knownIri = await this.registry.ensure(prefix);
      if (knownIri) {
        const edits = this.editsForDocument(doc, prefix, knownIri, diagnostic);
        if (edits.length > 0) {
          actions.push({
            title: doc.languageId === 'jsonld'
              ? `Declare prefix "${prefix}" in nearest existing @context from prefix.cc`
              : `Declare prefix "${prefix}" from prefix.cc`,
            kind: CodeActionKind.QuickFix,
            isPreferred: true,
            diagnostics: [diagnostic],
            edit: { changes: { [params.textDocument.uri]: edits } },
          });
        }
        continue;
      }

      const fallbackIri = generatedNamespace(prefix);
      const fallbackEdits = this.editsForDocument(doc, prefix, fallbackIri, diagnostic);
      if (fallbackEdits.length > 0) {
        actions.push({
          title: doc.languageId === 'jsonld'
            ? `Prefix "${prefix}" not found in prefix.cc; generate placeholder in nearest applicable @context`
            : `Prefix "${prefix}" not found in prefix.cc; generate placeholder declaration`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: { changes: { [params.textDocument.uri]: fallbackEdits } },
        });
      }
    }

    return actions;
  }

  private editsForDocument(doc: TextDocument, prefix: string, iri: string, diagnostic: Diagnostic): TextEdit[] {
    if (doc.languageId === 'turtle') return turtlePrefixEdit(doc, prefix, iri);
    if (doc.languageId === 'jsonld') return jsonldContextEdits(doc, prefix, iri, diagnostic);
    return [];
  }
}
