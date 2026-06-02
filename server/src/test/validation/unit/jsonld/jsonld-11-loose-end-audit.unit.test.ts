/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseTree } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';
import { DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { TermDefinitionTypeCheck } from '../../../../business/validation/jsonld/semantic/rules/term-definition.js';
import LanguageTag from '../../../../business/validation/jsonld/literal/rules/language-tag.js';
import MissingValue from '../../../../business/validation/jsonld/literal/rules/missing-value.js';
import ValueScalar from '../../../../business/validation/jsonld/syntax/rules/value-scalar.js';
import JsonLiteral from '../../../../business/validation/jsonld/literal/rules/json-literal.js';
import InvalidTypeValue from '../../../../business/validation/jsonld/semantic/rules/invalid-type-value.js';
import InvalidIri from '../../../../business/validation/jsonld/semantic/rules/invalid-iri.js';
import XsdDatatype from '../../../../business/validation/jsonld/literal/rules/xsd-datatype.js';
import NonStringIdCheck from '../../../../business/validation/jsonld/semantic/rules/non-string-id.js';
import RelativeIriCheck from '../../../../business/validation/jsonld/semantic/rules/relative-iri.js';
import EmptyLiteral from '../../../../business/validation/jsonld/literal/rules/empty-literal.js';

function ast(text: string) {
  const tree = parseTree(text, [], { allowTrailingComma: true, disallowComments: false });
  if (!tree) throw new Error('failed to parse test JSON');
  return tree;
}

describe('JSON-LD 1.1 loose-end standards audit', () => {
  it('allows null context term definitions and rejects array-valued term definitions', () => {
    const valid = JSON.stringify({ '@context': { obsolete: null } });
    const validRule = new TermDefinitionTypeCheck();
    validRule.init({ text: valid, ast: ast(valid) });
    expect(validRule.run()).toHaveLength(0);

    const invalid = JSON.stringify({ '@context': { bad: ['http://example.com/bad'] } });
    const invalidRule = new TermDefinitionTypeCheck();
    invalidRule.init({ text: invalid, ast: ast(invalid) });
    expect(invalidRule.run()).toHaveLength(1);
  });

  it('allows @language null in contexts while still validating invalid language strings', () => {
    const contextNull = JSON.stringify({ '@context': { '@language': null } });
    const nullRule = new LanguageTag();
    nullRule.init({ text: contextNull, ast: ast(contextNull) });
    expect(nullRule.run()).toHaveLength(0);

    const invalid = JSON.stringify({ '@context': { '@language': 'not a tag' } });
    const invalidRule = new LanguageTag();
    invalidRule.init({ text: invalid, ast: ast(invalid) });
    expect(invalidRule.run()).toHaveLength(1);
  });

  it('does not report @value null as invalid JSON-LD', () => {
    const text = JSON.stringify({ '@value': null });
    const rule = new MissingValue();
    rule.init({ text, ast: ast(text) });
    expect(rule.run()).toHaveLength(0);
  });

  it('allows JSON literal object and array values for @type @json', () => {
    const objectValue = JSON.stringify({ '@value': { a: 1 }, '@type': '@json' });
    const objectScalarRule = new ValueScalar();
    objectScalarRule.init({ text: objectValue, ast: ast(objectValue) });
    expect(objectScalarRule.run()).toHaveLength(0);
    const objectJsonRule = new JsonLiteral();
    objectJsonRule.init({ text: objectValue, ast: ast(objectValue) });
    expect(objectJsonRule.run()).toHaveLength(0);

    const arrayValue = JSON.stringify({ '@value': [1, true, null], '@type': '@json' });
    const arrayScalarRule = new ValueScalar();
    arrayScalarRule.init({ text: arrayValue, ast: ast(arrayValue) });
    expect(arrayScalarRule.run()).toHaveLength(0);
  });

  it('applies @type keyword aliases to type-shape and IRI validation', async () => {
    const invalidShape = JSON.stringify({ '@context': { kind: '@type' }, kind: 7 });
    const shapeRule = new InvalidTypeValue();
    shapeRule.init({ text: invalidShape, ast: ast(invalidShape) });
    expect(shapeRule.run()).toHaveLength(1);

    const badPrefix = JSON.stringify({ '@context': { kind: '@type' }, kind: 'bad:Thing' });
    const iriRule = new InvalidIri();
    await iriRule.init({ text: badPrefix, ast: ast(badPrefix), prefixMap: new Map<string, string>() });
    expect(iriRule.run()).toHaveLength(1);
  });

  it('applies @type aliases to XSD datatype validation in value objects', () => {
    const text = JSON.stringify({
      '@context': { kind: '@type', xsd: 'http://www.w3.org/2001/XMLSchema#' },
      '@value': 'not-an-integer',
      kind: 'xsd:integer',
    });
    const rule = new XsdDatatype();
    rule.init({
      text,
      ast: ast(text),
      prefixMap: new Map([['xsd', 'http://www.w3.org/2001/XMLSchema#']]),
    });
    expect(rule.run()).toHaveLength(1);
  });

  it('applies @id aliases to @id shape and relative IRI validation', () => {
    const nonString = JSON.stringify({ '@context': { id: '@id' }, id: 123 });
    const idRule = new NonStringIdCheck();
    idRule.init({ text: nonString, ast: ast(nonString) });
    expect(idRule.run()).toHaveLength(1);

    const relative = JSON.stringify({ '@context': { id: '@id' }, id: 'relative/path' });
    const relativeRule = new RelativeIriCheck();
    relativeRule.init({ text: relative, ast: ast(relative) });
    expect(relativeRule.run()).toHaveLength(1);
  });

  it('keeps empty string literals as a data-quality warning, not a JSON-LD standard error', () => {
    const text = JSON.stringify({ '@value': '' });
    const rule = new EmptyLiteral();
    rule.init({ text, ast: ast(text) });
    const diagnostics = rule.run();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });
});
