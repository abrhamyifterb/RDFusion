/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { CodeActionParams, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  RemoteTermVocabularyValidator,
} from '../../../../business/validation/turtle/remote-term-vocabulary-validator.js';
import { RemoteTermCodeActionProvider } from '../../../../business/validation/turtle/remote-term-code-actions.js';

function provider(remoteTerms?: string[], localTerms: string[] = []) {
  return {
    getCachedRemoteTermsForPrefix: (_prefix: string, namespaceIri?: string) => namespaceIri && remoteTerms ? new Set(remoteTerms) : undefined,
    getKnownTermsForPrefix: () => new Set(localTerms),
  } as any;
}

function parsedWithToken(
  image: string,
  prefixes: Record<string, string> = { skos: 'http://www.w3.org/2004/02/skos/core#' },
  startColumn = 10,
) {
  return {
    prefixes,
    tokens: [{
      type: 'PNAME_LN',
      image,
      startLine: 2,
      startColumn,
      endLine: 2,
      endColumn: startColumn + image.length - 1,
      startOffset: 40,
      endOffset: 40 + image.length - 1,
    }],
    quads: [],
    errors: [],
  } as any;
}

describe('RemoteTermVocabularyValidator', () => {
  it('reports likely remote vocabulary typos with close suggestions', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['Concept', 'ConceptScheme', 'prefLabel', 'broader']));

    const diagnostics = validator.validate(parsedWithToken('skos:Conceptttt'));

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE);
    expect(diagnostics[0].severity).toBe(DiagnosticSeverity.Warning);
    expect(diagnostics[0].message).toContain('Did you mean');
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe('skos:Concept');
  });

  it('does not let local document usage suppress a likely remote vocabulary typo', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['Concept', 'ConceptScheme', 'prefLabel'], ['Conceptttt']));

    const diagnostics = validator.validate(parsedWithToken('skos:Conceptttt'));

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe('skos:Concept');
  });

  it('uses the document prefix alias in diagnostics and quick fixes', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['Concept', 'ConceptScheme', 'prefLabel']));

    const diagnostics = validator.validate(parsedWithToken('thes:Conceptttt', { thes: 'http://www.w3.org/2004/02/skos/core#' }));

    expect(diagnostics).toHaveLength(1);
    expect((diagnostics[0].data as any).namespaceIri).toBe('http://www.w3.org/2004/02/skos/core#');
    expect((diagnostics[0].data as any).suggestions[0].curie).toBe('thes:Concept');
  });

  it('does not report when no cached remote vocabulary is available', () => {
    const validator = new RemoteTermVocabularyValidator(provider(undefined));

    expect(validator.validate(parsedWithToken('skos:Conceptttt'))).toHaveLength(0);
  });

  it('does not report known remote terms', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['Concept', 'prefLabel']));

    expect(validator.validate(parsedWithToken('skos:Concept'))).toHaveLength(0);
  });

  it('offers quick fixes for remote vocabulary diagnostics', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['Concept', 'ConceptScheme', 'prefLabel']));
    const diagnostic = validator.validate(parsedWithToken('skos:Conceptttt'))[0];
    const providerUnderTest = new RemoteTermCodeActionProvider();

    const actions = providerUnderTest.provideCodeActions({
      textDocument: { uri: 'file:///data.ttl' },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    } as CodeActionParams);

    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].kind).toBe('quickfix');
    expect(actions[0].title).toContain('skos:Concept');
    expect(actions[0].edit?.changes?.['file:///data.ttl']?.[0].newText).toBe('skos:Concept');
  });

  it('uses an end-exclusive full-token range so quick fixes do not leave trailing characters', () => {
    const validator = new RemoteTermVocabularyValidator(provider(['altLabel', 'prefLabel']));
    const line = 'ex:a skos:altLasbel .';
    const tokenImage = 'skos:altLasbel';
    const startColumn = line.indexOf(tokenImage) + 1;
    const diagnostic = validator.validate(parsedWithToken(tokenImage, undefined as any, startColumn))[0];
    const providerUnderTest = new RemoteTermCodeActionProvider();

    const actions = providerUnderTest.provideCodeActions({
      textDocument: { uri: 'file:///data.ttl' },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    } as CodeActionParams);

    const edit = actions[0].edit?.changes?.['file:///data.ttl']?.[0];
    expect(edit?.newText).toBe('skos:altLabel');
    expect(edit?.range.start.character).toBe(line.indexOf(tokenImage));
    expect(edit?.range.end.character).toBe(line.indexOf(tokenImage) + tokenImage.length);

    const updatedLine =
      line.slice(0, edit!.range.start.character) +
      edit!.newText +
      line.slice(edit!.range.end.character);
    expect(updatedLine).toBe('ex:a skos:altLabel .');
  });
});
