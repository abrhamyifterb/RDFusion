/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse, parseTree, ParseError, printParseErrorCode } from "jsonc-parser";
import { Parser as N3Parser, Quad } from "n3";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import * as jsonld from "jsonld";

import { ContextExtractor } from "./context/context-extractor";
import { DefinitionExtractor } from "./definitions/definition-extractor";
import { IdRangeBuilder } from "./id-range-builder";
import { QuadPositionAttacher } from "./quad-positions/quad-position-attach";
import { rangeFromOffsets } from "../../utils/shared/jsonld/range-from-offsets";
import { findJsonLdDefaultVocab, findJsonLdPrefixNamespaces, isJsonLdPrefixTermDefinition } from "../../utils/shared/jsonld/context-prefix";

import { ActiveContextResolver, setResolvedContext } from "./active-context-resolver";
import type { ResolvedContext } from "./active-context-resolver";

import type { JsonldParsedGraph } from "../irdf-parser";
import { getSharedDocumentLoader } from './auto-document-loader';

export class JsonLdParser {
	private static readonly parseOptions = { allowTrailingComma: true, disallowComments: false };
	private contextExtractor    = new ContextExtractor();
	private definitionExtractor = new DefinitionExtractor();

	constructor(private activeCtxResolver = new ActiveContextResolver()) {}

	async parse(text: string): Promise<JsonldParsedGraph> {
    if (text.trim() === "") {
    	return { text, ast: undefined!, contextMap: new Map(), definitions: [], quads: [], diagnostics: [] };
    }

    const errors: ParseError[] = [];
    const jsonObj = parse(text, errors, JsonLdParser.parseOptions);

    const diagnostics = errors.map(e =>
		Diagnostic.create(
			rangeFromOffsets(text, e?.offset, e?.offset + e.length),
			printParseErrorCode(e.error),
			DiagnosticSeverity.Error,
			e.error,
			"jsonc-parser"
		)
    );

    const ast = parseTree(text, [], JsonLdParser.parseOptions);
    if (!ast) {
		diagnostics.push(
			Diagnostic.create(
			rangeFromOffsets(text, 0, 0),
			"Failed to build JSONC AST",
			DiagnosticSeverity.Error,
			"jsonc-parser"
			)
		);
		return { text, ast: undefined!, contextMap: new Map(), definitions: [], quads: [], diagnostics };
    }

    const localContextMap = this.contextExtractor.extract(ast, text);
    const localPrefixMap = findJsonLdPrefixNamespaces(ast, text);
    const localVocab = findJsonLdDefaultVocab(ast, text);
    const definitions     = this.definitionExtractor.extract(ast, text);

    let effectiveContextMap = localContextMap;
    let effectivePrefixMap = localPrefixMap;
    let effectiveVocab = localVocab;
    let effectiveResolvedContext: ResolvedContext | undefined;

    try {
		const resolved = await this.activeCtxResolver.resolveForDocument(jsonObj);
		effectiveResolvedContext = resolved;
		effectiveContextMap = new Map<string, string>();
		effectivePrefixMap = new Map<string, string>();
		for (const [term, def] of resolved.terms) {
			if (def["@id"] != null) {
				effectiveContextMap.set(term, def["@id"]!);
				if (isJsonLdPrefixTermDefinition(term, def)) {
					effectivePrefixMap.set(term, def["@id"]!);
				}
			}
		}
		effectiveVocab = resolved.vocab;
		setResolvedContext(ast, resolved);
    } catch (err: any) {
		diagnostics.push(
			Diagnostic.create(
			rangeFromOffsets(text, 0, 0),
			`Context resolution: ${err?.message ?? err}`,
			DiagnosticSeverity.Warning,
			String(err?.message ?? err),
			"RDFusion"
			)
		);
		setResolvedContext(ast, undefined);
    }

    const rangeBuilder = new IdRangeBuilder(
		effectiveContextMap,
		effectivePrefixMap,
		effectiveResolvedContext?.base,
		effectiveVocab,
	);
    const idRanges = rangeBuilder.extract(ast, text);
    const predicateRanges = rangeBuilder.extractPredicateRanges(ast, text);

    const documentLoader = getSharedDocumentLoader();

    let nquads = "";
    try {
		nquads = (await jsonld.toRDF(jsonObj, {
			format: "application/n-quads",
			documentLoader: documentLoader as any,
		})) as string;
	} catch (err: any) {
		diagnostics.push(
			Diagnostic.create(
			rangeFromOffsets(text, 0, 0),
			"Invalid JSON-LD syntax",
			DiagnosticSeverity.Error,
			err?.message ?? String(err),
			"jsonld"
			)
		);
    }

    let quads: Quad[] = [];
    try {
    	quads = new N3Parser().parse(nquads);
    } catch (err: any) {
		diagnostics.push(
			Diagnostic.create(
			rangeFromOffsets(nquads, 0, nquads.length),
			`N-Quads parse error: ${err?.message ?? err}`,
			DiagnosticSeverity.Error,
			err?.message ?? String(err),
			"n3"
			)
		);
    }

    new QuadPositionAttacher(idRanges, predicateRanges).attach(quads);

    return {
		text,
		ast,
		contextMap: effectiveContextMap,
		prefixMap: effectivePrefixMap,
		vocab: effectiveVocab,
		resolvedContext: effectiveResolvedContext,
		sourceMap: {
			subjectRanges: idRanges,
			predicateRanges,
		},
		definitions,
		quads,
		diagnostics,
	};
	}
}
