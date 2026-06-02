/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node.js';
import type { ParsedGraph } from '../../../data/irdf-parser.js';
import type { TermProvider } from '../../autocomplete/term-completion/term-provider.js';
import { tokenToLspRange } from '../../../utils/shared/turtle/range.js';
import { findTermSuggestions } from './term-suggestion-matcher.js';
import {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  type RemoteTermDiagnosticData,
} from '../remote-term-diagnostics.js';

export {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  type RemoteTermDiagnosticData,
  type RemoteTermSuggestion,
} from '../remote-term-diagnostics.js';
export { findTermSuggestions as findRemoteTermSuggestions } from './term-suggestion-matcher.js';

function splitCurie(value: string): { prefix: string; term: string } | undefined {
  const match = value.match(/^([A-Za-z_][\w-]*):(.+)$/);
  if (!match) return undefined;
  const term = match[2] ?? '';
  if (!term || term.startsWith('//')) return undefined;
  return { prefix: match[1]!, term };
}

export class RemoteTermVocabularyValidator {
  constructor(private readonly termProvider: TermProvider) {}

  validate(parsedGraph: ParsedGraph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const tokens = parsedGraph.tokens ?? [];
    const prefixes = parsedGraph.prefixes ?? {};
    const seen = new Set<string>();

    for (const token of tokens) {
      if (token?.type !== 'PNAME_LN') continue;
      const parts = splitCurie(String(token.image ?? ''));
      if (!parts) continue;
      const { prefix, term } = parts;
      const namespaceIri = prefixes[prefix];
      if (!namespaceIri) continue;

      const remoteTerms = this.termProvider.getCachedRemoteTermsForPrefix(prefix, namespaceIri);
      if (!remoteTerms || remoteTerms.size === 0) continue;
      if (remoteTerms.has(term)) continue;

      const key = `${namespaceIri}:${prefix}:${term}:${token.startOffset ?? token.startLine}:${token.startColumn}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const suggestions = findTermSuggestions({
        prefix,
        term,
        remoteTerms,
        localTerms: [],
        limit: 5,
      });
      if (suggestions.length === 0) continue;

      const top = suggestions.slice(0, 3).map(s => `\`${s.curie}\``).join(', ');
      const diagnostic = Diagnostic.create(
        tokenToLspRange(token),
        `Likely vocabulary typo: \`${prefix}:${term}\` was not found in the known terms for \`${prefix}\`. Did you mean ${top}?`,
        DiagnosticSeverity.Warning,
        REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
        'RDFusion Vocabulary',
      );
      diagnostic.data = {
        prefix,
        term,
        curie: `${prefix}:${term}`,
        namespaceIri,
        suggestions,
      } satisfies RemoteTermDiagnosticData;
      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }
}
