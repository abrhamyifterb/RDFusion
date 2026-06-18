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
import IdUsageCheck from '../../../../business/validation/jsonld/semantic/rules/id-usage.js';
import ContainerUsageCheck from '../../../../business/validation/jsonld/semantic/rules/container-consistency.js';
import InvalidTypeValue from '../../../../business/validation/jsonld/semantic/rules/invalid-type-value.js';
import ListRule from '../../../../business/validation/jsonld/syntax/rules/list.js';
import SetRule from '../../../../business/validation/jsonld/syntax/rules/set.js';
import ValueScalar from '../../../../business/validation/jsonld/syntax/rules/value-scalar.js';
import GraphArrayCheck from '../../../../business/validation/jsonld/semantic/rules/graph-array.js';
import ReservedKeywordRedefinition from '../../../../business/validation/jsonld/semantic/rules/reserved-keywords.js';

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

  it('uses resolved remote context term @type:@id mappings for id usage warnings', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      'týká_se_pojmu': [
        4,
        'https://slovník.gov.cz/legislativní/sbírka/361/2000/pojem/skupina-vozidel',
      ],
    });
    const rule = new IdUsageCheck();
    rule.init({
      text,
      ast: ast(text),
      resolvedContext: {
        terms: new Map([
          ['týká_se_pojmu', { '@id': 'https://example.com/pojem', '@type': '@id' }],
        ]),
      },
    });

    const diags = rule.run();

    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('will expand as a JSON literal');
    expect(diags[0].severity).toBe(2);
  });

  it('does not require arrays for JSON-LD @set or @list container mappings', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      právní_předpis: 'https://www.e-sbirka.cz/eli/cz/sb/2000/365',
      nick: 'joe',
    });
    const rule = new ContainerUsageCheck();
    rule.init({
      text,
      ast: ast(text),
      resolvedContext: {
        terms: new Map([
          [
            'právní_předpis',
            {
              '@id': 'http://data.europa.eu/r5r/applicableLegislation',
              '@type': '@id',
              '@container': ['@set'],
            },
          ],
          [
            'nick',
            {
              '@id': 'http://xmlns.com/foaf/0.1/nick',
              '@container': ['@list'],
            },
          ],
        ]),
      },
    });

    expect(rule.run()).toHaveLength(0);
  });

  it('requires map objects for JSON-LD language and index container mappings', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      label: 'The Queen',
    });
    const rule = new ContainerUsageCheck();
    rule.init({
      text,
      ast: ast(text),
      resolvedContext: {
        terms: new Map([
          [
            'label',
            {
              '@id': 'http://www.w3.org/2000/01/rdf-schema#label',
              '@container': ['@language'],
            },
          ],
        ]),
      },
    });

    const diags = rule.run();

    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('JSON-LD expects a map object');
  });

  it('uses resolved remote @type aliases in type value validation', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      typ: [4],
    });
    const rule = new InvalidTypeValue();
    rule.init({
      text,
      ast: ast(text),
      resolvedContext: {
        terms: new Map([['typ', { '@id': '@type' }]]),
      },
    });

    const diags = rule.run();

    expect(diags).toHaveLength(1);
    expect(diags[0].message).toContain('@type');
  });


  it('allows JSON-LD @list and @set values to be scalars, objects, or arrays', () => {
    const listText = JSON.stringify({ '@list': 'one item' });
    const listRule = new ListRule();
    listRule.init({ text: listText, ast: ast(listText), contextMap: new Map(), definitions: [] });
    expect(listRule.run()).toHaveLength(0);

    const setText = JSON.stringify({ '@set': 7 });
    const setRule = new SetRule();
    setRule.init({ text: setText, ast: ast(setText) });
    expect(setRule.run()).toHaveLength(0);
  });

  it('allows @graph to be a single node object as well as an array', () => {
    const text = JSON.stringify({ '@graph': { '@id': 'https://example.com/node' } });
    const rule = new GraphArrayCheck();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(0);
  });

  it('allows the JSON-LD 1.1 @type context definition form', () => {
    const text = JSON.stringify({ '@context': { '@type': { '@container': '@set', '@protected': true } } });
    const rule = new ReservedKeywordRedefinition();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(0);
  });

  it('requires @version in context definitions to be 1.1', () => {
    const text = JSON.stringify({ '@context': { '@version': 1.0 } });
    const rule = new ReservedKeywordRedefinition();
    rule.init({ text, ast: ast(text) });

    expect(rule.run()).toHaveLength(1);
  });

  it('allows @type null only in value objects', () => {
    const valueObject = JSON.stringify({ '@value': 'plain', '@type': null });
    const valueRule = new InvalidTypeValue();
    valueRule.init({ text: valueObject, ast: ast(valueObject) });
    expect(valueRule.run()).toHaveLength(0);

    const nodeObject = JSON.stringify({ '@id': 'https://example.com/node', '@type': null });
    const nodeRule = new InvalidTypeValue();
    nodeRule.init({ text: nodeObject, ast: ast(nodeObject) });
    expect(nodeRule.run()).toHaveLength(1);
  });


  it('uses resolved @type aliases when allowing @json value objects', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      '@value': { a: 1 },
      kind: '@json',
    });
    const rule = new ValueScalar();
    rule.init({
      text,
      ast: ast(text),
      resolvedContext: {
        terms: new Map([['kind', { '@id': '@type' }]]),
      },
    });

    expect(rule.run()).toHaveLength(0);
  });

  it('uses resolved @value aliases in XSD datatype validation', () => {
    const text = JSON.stringify({
      '@context': 'https://example.com/context.jsonld',
      val: 'not-an-integer',
      typ: 'xsd:integer',
    });
    const rule = new XsdDatatype();
    rule.init({
      text,
      ast: ast(text),
      prefixMap: new Map([['xsd', 'http://www.w3.org/2001/XMLSchema#']]),
      resolvedContext: {
        terms: new Map([
          ['val', { '@id': '@value' }],
          ['typ', { '@id': '@type' }],
        ]),
      },
    });

    expect(rule.run()).toHaveLength(1);
  });

});
