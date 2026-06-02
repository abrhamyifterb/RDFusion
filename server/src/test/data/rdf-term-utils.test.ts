import { describe, expect, it } from 'vitest';
import { RDF_TYPE, SH_PROPERTY } from '../../data/rdf/rdf-vocabulary';
import { rdfLiteralText, rdfTermType, rdfTermValue, uniqueSorted } from '../../data/rdf/rdf-term-utils';

describe('RDF vocabulary helpers', () => {
	it('exposes shared RDF and SHACL constants used by parser, SHACL, and term metadata code', () => {
		expect(RDF_TYPE).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
		expect(SH_PROPERTY).toBe('http://www.w3.org/ns/shacl#property');
	});

	it('reads RDFJS-like term values and literal text safely', () => {
		expect(rdfTermValue({ value: 'http://example.com/a' })).toBe('http://example.com/a');
		expect(rdfTermType({ termType: 'NamedNode' })).toBe('NamedNode');
		expect(rdfLiteralText({ termType: 'Literal', value: ' Label ' })).toBe('Label');
		expect(rdfLiteralText({ termType: 'NamedNode', value: 'http://example.com/a' })).toBeUndefined();
	});

	it('deduplicates, sorts, and limits display values consistently', () => {
		expect(uniqueSorted(['b', '', 'a', 'b', 'c'], 2)).toEqual(['a', 'b']);
	});
});
