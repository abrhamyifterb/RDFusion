/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node } from 'jsonc-parser';
import {
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver/node.js';
import type { JsonldParsedGraph } from '../../../data/irdf-parser.js';
import { rangeFromOffsets } from '../../../utils/shared/jsonld/range-from-offsets.js';
import { findJsonLdLocalContextAt, isJsonLdGenDelim, jsonStringNodeValue } from '../../../utils/shared/jsonld/context-prefix.js';
import type { TermProvider } from '../../autocomplete/term-completion/term-provider.js';
import {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  type RemoteTermDiagnosticData,
} from '../remote-term-diagnostics.js';
import { findTermSuggestions } from '../turtle/term-suggestion-matcher.js';

const JSON_LD_KEYWORDS = new Set([
  '@base', '@container', '@context', '@direction', '@graph', '@id', '@import',
  '@included', '@index', '@json', '@language', '@list', '@nest', '@none',
  '@prefix', '@propagate', '@protected', '@reverse', '@set', '@type', '@value',
  '@version', '@vocab',
]);

function splitCurie(value: string): { prefix: string; term: string } | undefined {
  const match = value.match(/^([A-Za-z_][\w-]*):(.+)$/);
  if (!match) return undefined;
  const term = match[2] ?? '';
  if (!term || term.startsWith('//')) return undefined;
  return { prefix: match[1]!, term };
}

function stringContentRange(text: string, node: Node) {
  return rangeFromOffsets(text, node.offset + 1, node.offset + node.length - 1);
}

function nodeKey(text: string, node: Node | undefined): string | undefined {
  return jsonStringNodeValue(text, node);
}

function prefixMapFromContextMap(contextMap: Map<string, string>): Map<string, string> {
  const prefixMap = new Map<string, string>();
  for (const [term, iri] of contextMap.entries()) {
    if (term && !term.includes(':') && !term.includes('/') && iri && !iri.startsWith('@') && (iri.startsWith('_:') || isJsonLdGenDelim(iri))) {
      prefixMap.set(term, iri);
    }
  }
  return prefixMap;
}

function isVocabularyRelativeTerm(value: string): boolean {
  return !!value && !value.startsWith('@') && !value.includes(':');
}

function isContextDefinedTerm(contextMap: Map<string, string>, value: string): boolean {
  return contextMap.has(value);
}

function isContextProperty(text: string, node: Node): boolean {
  return node.type === 'property' && nodeKey(text, node.children?.[0]) === '@context';
}

export class JsonLdRemoteTermVocabularyValidator {
  constructor(private readonly termProvider: TermProvider) {}

  validate(parsedGraph: JsonldParsedGraph): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const ast = parsedGraph.ast;
    const text = parsedGraph.text;
    const fallbackContextMap = parsedGraph.contextMap ?? new Map<string, string>();
    const fallbackPrefixMap = parsedGraph.prefixMap ?? prefixMapFromContextMap(fallbackContextMap);
    const fallbackVocabIri = parsedGraph.vocab;
    const seen = new Set<string>();

    const activeContextAt = (node: Node) => {
      const local = ast ? findJsonLdLocalContextAt(ast, text, node.offset) : undefined;
      if (local?.hasContext) {
        return {
          contextMap: local.contextMap,
          prefixMap: local.prefixMap,
          vocabIri: local.vocab,
          keywordAliases: local.keywordAliases,
        };
      }
      return {
        contextMap: fallbackContextMap,
        prefixMap: fallbackPrefixMap,
        vocabIri: fallbackVocabIri,
        keywordAliases: new Map<string, Set<string>>(),
      };
    };

    const isTypeKeyAt = (key: string | undefined, node: Node | undefined): boolean => {
      if (!key || !node) return false;
      if (key === '@type') return true;
      const active = activeContextAt(node);
      return active.keywordAliases.get('@type')?.has(key) ?? active.contextMap.get(key) === '@type';
    };

    const inspect = (value: string, node: Node, options: { role: 'property' | 'type' }) => {
      if (JSON_LD_KEYWORDS.has(value)) return;
      const active = activeContextAt(node);
      let prefix: string;
      let term: string;
      let namespaceIri: string | undefined;
      const parts = splitCurie(value);
      if (parts) {
        prefix = parts.prefix;
        term = parts.term;
        namespaceIri = active.prefixMap.get(prefix);
      } else if (active.vocabIri && isVocabularyRelativeTerm(value) && !isContextDefinedTerm(active.contextMap, value)) {
        prefix = '@vocab';
        term = value;
        namespaceIri = active.vocabIri;
      } else {
        return;
      }
      if (!namespaceIri) return;

      const remoteTerms = this.termProvider.getCachedRemoteTermsForPrefix(prefix, namespaceIri, 'jsonld');
      if (!remoteTerms || remoteTerms.size === 0) return;
      if (remoteTerms.has(term)) return;

      const key = `${namespaceIri}:${prefix}:${term}:${node.offset}:${options.role}`;
      if (seen.has(key)) return;
      seen.add(key);

      const suggestions = findTermSuggestions({
        prefix,
        term,
        remoteTerms,
        localTerms: [],
        limit: 5,
      });
      if (suggestions.length === 0) return;

      const written = prefix === '@vocab' ? term : `${prefix}:${term}`;
      const sourceLabel = prefix === '@vocab' ? '@vocab' : prefix;
      const top = suggestions.slice(0, 3).map(s => `\`${s.curie}\``).join(', ');
      const diagnostic = Diagnostic.create(
        stringContentRange(text, node),
        `Likely vocabulary typo: \`${written}\` was not found in the known terms for \`${sourceLabel}\`. Did you mean ${top}?`,
        DiagnosticSeverity.Warning,
        REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
        'RDFusion Vocabulary',
      );
      diagnostic.data = {
        prefix,
        term,
        curie: written,
        namespaceIri,
        suggestions,
      } satisfies RemoteTermDiagnosticData;
      diagnostics.push(diagnostic);
    };

    const walk = (node: Node | undefined, inContext = false, parentKey?: string) => {
      if (!node) return;
      if (node.type === 'property') {
        const keyNode = node.children?.[0];
        const valueNode = node.children?.[1];
        const key = nodeKey(text, keyNode);
        const nextInContext = inContext || isContextProperty(text, node);

        if (!inContext && key && !key.startsWith('@')) {
          inspect(key, keyNode!, { role: 'property' });
        }

        walk(valueNode, nextInContext, key);
        return;
      }

      if (!inContext && node.type === 'string') {
        const value = jsonStringNodeValue(text, node);
        if (value && isTypeKeyAt(parentKey, node)) {
          inspect(value, node, { role: 'type' });
        }
      }

      for (const child of node.children ?? []) {
        walk(child, inContext, parentKey);
      }
    };

    walk(ast);
    return diagnostics;
  }
}
