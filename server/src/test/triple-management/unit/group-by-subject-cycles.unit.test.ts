import { describe, expect, it } from 'vitest';
import { Parser as N3Parser } from 'n3';
import type { Literal, Quad, Term } from 'n3';
import { GroupFormatter } from '../../../business/triple-management/grouping/turtle/group-by-subject';
import MillianRDFParser from '../../../data/turtle/ttl-parser';

function quadSignatures(quads: Quad[]): string[] {
	const term = (value: Term) => {
		if (value.termType !== 'Literal') {return `${value.termType}:${value.value}`;}
		const literal = value as Literal;
		return `${literal.termType}:${literal.value}:${literal.language}:${literal.datatype.value}`;
	};
	return quads
		.map(quad => `${term(quad.subject)} ${term(quad.predicate)} ${term(quad.object)}`)
		.sort();
}

async function groupSafely(source: string): Promise<string> {
	const parser = new MillianRDFParser();
	const parsed = await parser.parse(source);
	expect(parsed.errors).toHaveLength(0);

	const output = new GroupFormatter().group(parsed);
	expect(() => new N3Parser({ format: 'text/turtle' }).parse(output)).not.toThrow();
	const reparsed = await parser.parse(output);
	expect(reparsed.errors).toHaveLength(0);
	expect(quadSignatures(reparsed.quads)).toEqual(quadSignatures(parsed.quads));
	return output;
}

describe('GroupFormatter cycle handling', () => {
	it('preserves a self-referencing blank node with an explicit label', async () => {
		const output = await groupSafely([
			'@prefix ex: <http://example.com/> .',
			'ex:root ex:p _:self .',
			'_:self ex:p _:self .',
		].join('\n'));

		expect(output).toContain('_:self');
	});

	it('preserves an orphan two-node blank-node cycle', async () => {
		const output = await groupSafely([
			'@prefix ex: <http://example.com/> .',
			'_:left ex:p _:right .',
			'_:right ex:p _:left .',
		].join('\n'));

		expect(output).toContain('_:left');
		expect(output).toContain('_:right');
	});

	it('preserves a cyclic RDF list without attempting collection shorthand', async () => {
		const output = await groupSafely([
			'@prefix ex: <http://example.com/> .',
			'@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
			'ex:root ex:p _:list .',
			'_:list rdf:first ex:item ; rdf:rest _:list .',
		].join('\n'));

		expect(output).toContain('_:list');
		expect(output).not.toContain('( ex:item )');
	});

	it('continues to compact an ordinary acyclic RDF list', async () => {
		const output = await groupSafely([
			'@prefix ex: <http://example.com/> .',
			'ex:root ex:p ( ex:first ex:second ) .',
		].join('\n'));

		expect(output).toContain('( ex:first ex:second )');
	});
});
