import type { TermSuggestion } from './turtle/term-suggestion-matcher.js';

export const REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE = 'rdfusion.remoteTermVocabularyTypo';

export type RemoteTermSuggestion = TermSuggestion;

export interface RemoteTermDiagnosticData {
  prefix: string;
  term: string;
  curie: string;
  namespaceIri?: string;
  suggestions: RemoteTermSuggestion[];
}
