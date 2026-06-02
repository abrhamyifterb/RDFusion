import { describe, expect, it } from 'vitest';
import { findTermSuggestions } from '../../../../business/validation/turtle/term-suggestion-matcher.js';

describe('term suggestion matcher', () => {
  it('returns closest remote vocabulary terms in ranked order', () => {
    const suggestions = findTermSuggestions({
      prefix: 'skos',
      term: 'altLasbel',
      remoteTerms: ['prefLabel', 'altLabel', 'broader'],
      limit: 3,
    });

    expect(suggestions[0]).toMatchObject({
      curie: 'skos:altLabel',
      term: 'altLabel',
      source: 'remote',
    });
  });

  it('deduplicates identical curies and prefers remote suggestions over local suggestions', () => {
    const suggestions = findTermSuggestions({
      prefix: 'skos',
      term: 'Conceptttt',
      remoteTerms: ['Concept'],
      localTerms: ['Concept'],
      limit: 5,
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      curie: 'skos:Concept',
      source: 'remote',
    });
  });

  it('respects the requested suggestion limit and filters distant candidates', () => {
    const suggestions = findTermSuggestions({
      prefix: 'ex',
      term: 'Personn',
      remoteTerms: ['Person', 'PersonName', 'PersonLabel', 'UnrelatedVocabularyTerm'],
      limit: 2,
    });

    expect(suggestions.length).toBeLessThanOrEqual(2);
    expect(suggestions.map(s => s.curie)).toContain('ex:Person');
    expect(suggestions.map(s => s.curie)).not.toContain('ex:UnrelatedVocabularyTerm');
  });
});
