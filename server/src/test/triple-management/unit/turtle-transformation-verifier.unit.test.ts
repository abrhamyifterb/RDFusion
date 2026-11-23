import { describe, expect, it, vi } from 'vitest';
import type { Connection, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';
import { TurtleFormatterCommand } from '../../../business/triple-management/formatting/turtle/turtle-formatter-command';
import { assertTurtleTransformationSafe } from '../../../business/triple-management/formatting/turtle/turtle-transformation-verifier';
import type { DataManager } from '../../../data/data-manager';
import MillianRDFParser from '../../../data/turtle/ttl-parser';
import type { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

const defaultFormattingConfig = {
	indentSize: 2,
	useUntypedNumeric: true,
	useKnownPrefixes: false,
	compactSingletonLists: true,
	breakPredicates: true,
	breakObjects: false,
	breakSubject: true,
	blankLineBetweenSubjects: true,
	breakPredObj: true,
};

interface UnsafeFormattingCase {
	name: string;
	source: string;
	config?: Partial<typeof defaultFormattingConfig>;
	prefixes?: { prefix: string; iri: string }[];
}

const unsafeCases: UnsafeFormattingCase[] = [
	{
		name: 'a semicolon inside an IRI',
		source: '@prefix ex: <http://example.com/> .\nex:s ex:p <http://other.example/a;b> .',
	},
	{
		name: 'a comma inside an IRI',
		source: '@prefix ex: <http://example.com/> .\nex:s ex:p <http://other.example/a,b> .',
		config: { breakObjects: true },
	},
	{
		name: 'parentheses and whitespace inside a literal',
		source: '@prefix ex: <http://example.com/> .\nex:s ex:p "keep ( spaces ) here" .',
	},
	{
		name: 'a known namespace IRI inside a literal',
		source: '@prefix ex: <http://example.com/> .\nex:s ex:p "See <http://xmlns.com/foaf/0.1/name>" .',
		config: { useKnownPrefixes: true },
		prefixes: [{ prefix: 'foaf', iri: 'http://xmlns.com/foaf/0.1/' }],
	},
	{
		name: 'the boolean lexical form one',
		source: [
			'@prefix ex: <http://example.com/> .',
			'@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
			'ex:s ex:p "1"^^xsd:boolean .',
		].join('\n'),
	},
	{
		name: 'a multiline literal whose whitespace is changed',
		source: [
			'@prefix ex: <http://example.com/> .',
			'ex:s ex:p """line one; still literal',
			'line two, still literal""" .',
		].join('\n'),
	},
];

describe('Turtle transformation verifier', () => {
	it.each([
		['an empty document', '', '', 'file:///empty.ttl'],
		[
			'a prefix-only document',
			'@prefix ex: <http://example.com/> .',
			'@prefix renamed: <http://example.com/> .',
			'file:///prefix-only.ttl',
		],
		[
			'relative IRIs',
			'<subject> <predicate> <object> .',
			'<subject>\n  <predicate> <object> .',
			'file:///workspace/document.ttl',
		],
	])('accepts equivalent output for %s', async (_name, original, formatted, uri) => {
		const connection = { console: { error: vi.fn() } } as unknown as Connection;

		await expect(
			assertTurtleTransformationSafe(original, formatted, uri, connection),
		).resolves.toBeUndefined();
	});

	it('accepts equivalent datasets with different blank-node labels', async () => {
		const original = '@prefix ex: <http://example.com/> .\n_:left ex:p ex:o .';
		const formatted = '@prefix ex: <http://example.com/> .\n_:right ex:p ex:o .';
		const connection = { console: { error: vi.fn() } } as unknown as Connection;

		await expect(
			assertTurtleTransformationSafe(original, formatted, 'file:///equivalent.ttl', connection),
		).resolves.toBeUndefined();
	});

	it('accepts reordered named-node statements without blank-node canonicalization', async () => {
		const original = [
			'@prefix ex: <http://example.com/> .',
			'ex:first ex:p ex:a .',
			'ex:second ex:p ex:b .',
		].join('\n');
		const formatted = [
			'@prefix renamed: <http://example.com/> .',
			'renamed:second renamed:p renamed:b .',
			'renamed:first renamed:p renamed:a .',
		].join('\n');
		const connection = { console: { error: vi.fn() } } as unknown as Connection;

		await expect(
			assertTurtleTransformationSafe(original, formatted, 'file:///reordered.ttl', connection),
		).resolves.toBeUndefined();
	});

	it.each(unsafeCases)('warns and does not edit for $name', async ({ source, config, prefixes }) => {
		const uri = 'file:///unsafe-formatting.ttl';
		const document = TextDocument.create(uri, 'turtle', 1, source);
		const parsed = await new MillianRDFParser().parse(source);
		expect(parsed.errors).toHaveLength(0);

		const showWarningMessage = vi.fn().mockResolvedValue(undefined);
		const applyEdit = vi.fn();
		const connection = {
			console: { error: vi.fn() },
			window: { showWarningMessage },
			workspace: { applyEdit },
		} as unknown as Connection;
		const documents = { get: () => document } as unknown as TextDocuments<TextDocument>;
		const dataManager = {
			getSnapshot: () => ({ version: document.version, parsedGraph: parsed }),
		} as unknown as DataManager;
		const registry = { getAll: () => prefixes ?? [] } as unknown as PrefixRegistry;
		const settings = {
			turtle: { formatting: { ...defaultFormattingConfig, ...config } },
		} as unknown as RDFusionConfigSettings;

		await new TurtleFormatterCommand(dataManager, connection, documents, registry, settings).format({ uri });

		expect(applyEdit).not.toHaveBeenCalled();
		expect(showWarningMessage).toHaveBeenCalledOnce();
		expect(showWarningMessage.mock.calls[0][0]).toContain('document was not changed');
	});
});
