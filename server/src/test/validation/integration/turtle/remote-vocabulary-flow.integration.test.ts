/* eslint-disable @typescript-eslint/no-explicit-any */
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CodeActionParams, DiagnosticSeverity } from 'vscode-languageserver/node.js';

const mocks = vi.hoisted(() => ({
  dereference: vi.fn(),
}));

vi.mock('rdf-dereference', () => ({
  rdfDereferencer: {
    dereference: mocks.dereference,
  },
}));

import { RemoteTermCache } from '../../../../business/autocomplete/term-completion/remote-term-cache';
import {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  RemoteTermVocabularyValidator,
} from '../../../../business/validation/turtle/remote-term-vocabulary-validator';
import { RemoteTermCodeActionProvider } from '../../../../business/validation/turtle/remote-term-code-actions';
import {
  RDF_PROPERTY,
  RDF_TYPE,
  RDFS_LABEL,
} from '../../../../data/rdf/rdf-vocabulary';

function named(value: string): any {
  return { termType: 'NamedNode', value };
}

function literal(value: string): any {
  return { termType: 'Literal', value };
}

function quad(subject: string, predicate: string, object: any): any {
  return {
    subject: named(subject),
    predicate: named(predicate),
    object: typeof object === 'string' ? named(object) : object,
  };
}

function stream(quads: any[]): Readable {
  return Readable.from(quads, { objectMode: true });
}

function prefixRegistry(base: string): any {
  const prefixes: Record<string, string> = {
    thes: base,
    skos: base,
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  };
  return {
    ensure: vi.fn(async (prefix: string) => prefixes[prefix]),
    getIri: vi.fn((prefix: string) => prefixes[prefix]),
    getPrefix: vi.fn((iri: string) => Object.entries(prefixes).find(([, iriBase]) => iri.startsWith(iriBase))?.[0]),
    isKnownVocabulary: vi.fn((prefix: string, namespaceIri?: string) => {
      if (namespaceIri) return /^https?:\/\//i.test(namespaceIri);
      return !!prefixes[prefix];
    }),
    isKnownVocabularyNamespace: vi.fn((namespaceIri?: string) => !!namespaceIri && /^https?:\/\//i.test(namespaceIri)),
  };
}

function parsedGraphForLine(line: string, tokenImage: string, base: string): any {
  const startColumn = line.indexOf(tokenImage) + 1;
  return {
    prefixes: { thes: base },
    tokens: [{
      type: 'PNAME_LN',
      image: tokenImage,
      startLine: 1,
      startColumn,
      endLine: 1,
      endColumn: startColumn + tokenImage.length - 1,
      startOffset: startColumn - 1,
      endOffset: startColumn + tokenImage.length - 2,
    }],
    quads: [],
    errors: [],
  };
}

describe('remote vocabulary typo flow', () => {
  it('uses cached remote vocabulary data to warn and quick-fix the full aliased CURIE token', async () => {
    const base = 'http://www.w3.org/2004/02/skos/core#';
    const altLabel = `${base}altLabel`;
    mocks.dereference.mockResolvedValue({
      data: stream([
        quad(altLabel, RDF_TYPE, RDF_PROPERTY),
        quad(altLabel, RDFS_LABEL, literal('alternative label')),
      ]),
    });

    const cache = new RemoteTermCache(prefixRegistry(base));
    const connection = { window: { showErrorMessage: vi.fn() } } as any;

    await cache.prefetchPrefix('thes', connection, base);

    const validator = new RemoteTermVocabularyValidator({
      getCachedRemoteTermsForPrefix: (prefix: string, namespaceIri?: string) => cache.getCachedTermsForPrefix(prefix, namespaceIri),
    } as any);
    const line = 'ex:a thes:altLasbel "x" .';
    const diagnostic = validator.validate(parsedGraphForLine(line, 'thes:altLasbel', base))[0];

    expect(diagnostic).toBeDefined();
    expect(diagnostic.code).toBe(REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE);
    expect(diagnostic.severity).toBe(DiagnosticSeverity.Warning);
    expect((diagnostic.data as any).namespaceIri).toBe(base);
    expect((diagnostic.data as any).suggestions[0].curie).toBe('thes:altLabel');

    const actions = new RemoteTermCodeActionProvider().provideCodeActions({
      textDocument: { uri: 'file:///remote-flow.ttl' },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    } as CodeActionParams);
    const edit = actions[0].edit?.changes?.['file:///remote-flow.ttl']?.[0];

    expect(edit?.newText).toBe('thes:altLabel');
    expect(edit?.range.start.character).toBe(line.indexOf('thes:altLasbel'));
    expect(edit?.range.end.character).toBe(line.indexOf('thes:altLasbel') + 'thes:altLasbel'.length);

    const updatedLine = line.slice(0, edit!.range.start.character) + edit!.newText + line.slice(edit!.range.end.character);
    expect(updatedLine).toBe('ex:a thes:altLabel "x" .');
    expect(mocks.dereference).toHaveBeenCalledTimes(1);
    expect(mocks.dereference).toHaveBeenCalledWith(base);
  });
});
