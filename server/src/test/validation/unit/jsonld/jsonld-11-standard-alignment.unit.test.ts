/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseTree } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import ContextTypeCheck from '../../../../business/validation/jsonld/syntax/rules/context-type.js';
import ContextVocab from '../../../../business/validation/jsonld/syntax/rules/context-vocab.js';
import ContextBase from '../../../../business/validation/jsonld/syntax/rules/context-base.js';
import UndefinedPrefix from '../../../../business/validation/jsonld/semantic/rules/undefined-prefix.js';
import InvalidIri from '../../../../business/validation/jsonld/semantic/rules/invalid-iri.js';
import { TypeMappingCheck } from '../../../../business/validation/jsonld/semantic/rules/type-mapping.js';
import XsdDatatype from '../../../../business/validation/jsonld/literal/rules/xsd-datatype.js';

function ast(text: string) {
  const tree = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  if (!tree) throw new Error('failed to parse test JSON');
  return tree;
}

describe('JSON-LD 1.1 standards alignment', () => {
  it('allows JSON-LD 1.1 @context string, array, object, and null values', () => {
    const text = JSON.stringify({
      '@context': [
        'https://schema.org/',
        { schema: 'https://schema.org/' },
        null,
      ],
      '@graph': [{ '@context': null, '@id': 'schema:Thing' }],
    });
    const rule = new ContextTypeCheck();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(0);
  });

  it('reports invalid @context array members without rejecting valid context arrays', () => {
    const text = JSON.stringify({ '@context': [{ ex: 'http://example.com/' }, 42] });
    const rule = new ContextTypeCheck();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(1);
  });

  it('allows compact IRI @vocab mappings such as schema:', () => {
    const text = JSON.stringify({ '@context': { schema: 'https://schema.org/', '@vocab': 'schema:' } });
    const rule = new ContextVocab();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(0);
  });

  it('uses the rule key as diagnostic code and RDFusion as source for JSON-LD validation diagnostics', () => {
    const text = JSON.stringify({ '@context': { '@vocab': 7 } });
    const rule = new ContextVocab();
    rule.init({ text, ast: ast(text) });

    const [diagnostic] = rule.run();

    expect(diagnostic.code).toBe('vocabCheck');
    expect(diagnostic.source).toBe('RDFusion');
  });

  it('allows empty @base because JSON-LD 1.1 treats it as a valid IRI reference', () => {
    const text = JSON.stringify({ '@context': { '@base': '' } });
    const rule = new ContextBase();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(0);
  });

  it('uses prefixMap, not ordinary context terms, for compact IRI prefix validation', async () => {
    const text = JSON.stringify({
      '@context': { name: 'https://schema.org/name' },
      'name:Typo': 'Alice',
    });
    const rule = new UndefinedPrefix();
    await rule.init({
      text,
      ast: ast(text),
      contextMap: new Map([['name', 'https://schema.org/name']]),
      prefixMap: new Map<string, string>(),
    });

    expect(rule.run()).toHaveLength(1);
  });

  it('does not treat ordinary context terms as compact IRI prefixes in @type values', async () => {
    const text = JSON.stringify({
      '@context': { name: 'https://schema.org/name' },
      '@type': 'name:Person',
    });
    const rule = new InvalidIri();
    await rule.init({ text, ast: ast(text), prefixMap: new Map<string, string>() });

    expect(rule.run()).toHaveLength(1);
  });

  it('expands compact datatype IRIs by concatenating the prefix namespace and suffix', () => {
    const text = JSON.stringify({
      '@context': { xsd: 'http://www.w3.org/2001/XMLSchema#' },
      '@value': '12',
      '@type': 'xsd:integer',
    });
    const rule = new XsdDatatype();
    rule.init({
      text,
      ast: ast(text),
      prefixMap: new Map([['xsd', 'http://www.w3.org/2001/XMLSchema#']]),
    });

    expect(rule.run()).toHaveLength(0);
  });

  it('requires @type in context term definitions to be a string while allowing node @type arrays', () => {
    const invalidContextType = JSON.stringify({
      '@context': { ex: { '@id': 'http://example.com/value', '@type': ['@id'] } },
    });
    const contextRule = new TypeMappingCheck();
    contextRule.init({ text: invalidContextType, ast: ast(invalidContextType) });
    expect(contextRule.run()).toHaveLength(1);

    const nodeTypeArray = JSON.stringify({
      '@context': { ex: 'http://example.com/' },
      '@type': ['ex:Person', 'ex:Agent'],
    });
    const nodeRule = new TypeMappingCheck();
    nodeRule.init({ text: nodeTypeArray, ast: ast(nodeTypeArray) });
    expect(nodeRule.run()).toHaveLength(0);
  });
});
