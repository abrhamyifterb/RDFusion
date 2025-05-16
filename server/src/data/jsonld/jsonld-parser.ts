/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse, parseTree, ParseError, printParseErrorCode, Node } from 'jsonc-parser';
import jsonld from 'jsonld';
import { Parser as N3Parser, Quad } from 'n3';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver';
import { computeLineColumn } from '../compute-line-column.js';
import { Definition, JsonldParsedGraph } from '../irdf-parser.js';

type IdRangeMap = Map<string, Range>;

export function rangeFromOffsets(text: string, startOff: number, endOff: number): Range {
	const start = computeLineColumn(text, startOff);
	const end   = computeLineColumn(text, endOff);
	return Range.create(start, end);
}

function extractContextMap(ast: Node, text: string): Map<string,string> {
	const ctx = new Map<string,string>();
	const walk = (n: Node) => {
		if (n.type === 'property'
		&& text.slice(n.children![0].offset, n.children![0].offset + n.children![0].length) === '"@context"'
		&& n.children![1].type === 'object'
		) {
			for (const entry of n.children![1].children || []) {
				const keyNode = entry.children![0], valNode = entry.children![1];
				const term = text.slice(keyNode.offset+1, keyNode.offset+keyNode.length-1);
				let iri  = text.slice(valNode.offset+1, valNode.offset+valNode.length-1);
				if (iri.endsWith('/')) {
					iri = iri.slice(0,-1);
				}
				ctx.set(term, iri);
			}
		}
		n.children?.forEach(walk);
	};
	walk(ast);
	return ctx;
}

function extractDefinitions(ast: Node, text: string): Definition[] {
	const defs: Definition[] = [];
	let graphArr: Node|undefined;
	const findGraph = (n: Node) => {
		if (n.type === 'property'
		&& text.slice(n.children![0].offset, n.children![0].offset + n.children![0].length) === '"@graph"'
		&& n.children![1].type === 'array'
		) {
		graphArr = n.children![1];
		}
		n.children?.forEach(findGraph);
	};

	findGraph(ast);

	if (!graphArr) return defs;

	for (const item of graphArr.children || []) {
		if (item.type !== 'object') continue;
		let idNode: Node|undefined, typeNode: Node|undefined;
		for (const prop of item.children || []) {
			const key = text.slice(prop.children![0].offset, prop.children![0].offset + prop.children![0].length);
			if (key === '"@id"')   idNode   = prop.children![1];
			if (key === '"@type"') typeNode = prop.children![1];
		}
		if (idNode) {
			const idVal = text.slice(idNode.offset+1, idNode.offset+idNode.length-1);
			const def: Definition = { id: idVal, range: rangeFromOffsets(text, idNode.offset, idNode.offset+idNode.length) };
			if (typeNode) {
				def.typeIri   = text.slice(typeNode.offset+1, typeNode.offset+typeNode.length-1);
				def.typeRange = rangeFromOffsets(text, typeNode.offset, typeNode.offset+typeNode.length);
			}
			defs.push(def);
		}
	}

	return defs;
}

export class JsonLdParser {
	private static readonly parseOptions = { allowTrailingComma: true, disallowComments: false };

	async parse(text: string): Promise<JsonldParsedGraph> {
		const syntaxErrs: ParseError[] = [];
		const jsonObj = parse(text, syntaxErrs, JsonLdParser.parseOptions);
		const diagnostics = syntaxErrs.map(e =>
			Diagnostic.create(
				rangeFromOffsets(text, e.offset, e.offset + e.length),
				printParseErrorCode(e.error),
				DiagnosticSeverity.Error,
				e.error,
				'jsonc-parser'
			)
		);

		const ast        = parseTree(text, [], JsonLdParser.parseOptions)!;
		const contextMap = extractContextMap(ast, text);
		const definitions= extractDefinitions(ast, text);

		const idRanges = this.buildIdRangesFromAst(ast, text, contextMap);

		let nquads = '';
		try {
			nquads = (await jsonld.toRDF(jsonObj, { format:'application/n-quads' })) as string;
		} catch (error:any) {
      diagnostics.push(
        Diagnostic.create(
          rangeFromOffsets(text, 0, 0),
          "Invalid JSON-LD syntax",
          DiagnosticSeverity.Error,
          error.message,
          'jsonc-parser'
        )
      );
			// console.error(error);
		}
		const quads = new N3Parser().parse(nquads);
		this.attachQuadPositions(quads, idRanges);
		return { text, ast, contextMap, definitions, quads, diagnostics };
	}

	private buildIdRangesFromAst(ast: Node | undefined, text: string, ctx: Map<string,string>): IdRangeMap {
		const idRanges: IdRangeMap = new Map();
		if (!ast) {
			return idRanges;
		}
		const walk = (node: Node, ancestors: Node[]) => {
			if (node.type === 'property' && node.children && node.children.length >= 2) {
				const [keyNode, valNode] = node.children;
				const keyText = text.slice(keyNode.offset, keyNode.offset + keyNode.length).replace(/"/g, '');
				if (keyText === '@id') {
					if (
						ancestors.length >= 3 &&
						ancestors[0].type === 'object' &&
						ancestors[1].type === 'array' &&
						ancestors[2].type === 'property' &&
						text.slice(
							ancestors[2].children![0].offset,
							ancestors[2].children![0].offset + ancestors[2].children![0].length
						) === '"@graph"'
					) {
						const raw = text.slice(valNode.offset + 1, valNode.offset + valNode.length - 1);
						const [pfx, loc] = raw.split(':');
						let base = ctx.get(pfx) ?? pfx;
						if (base.endsWith('/')) {
							base = base.slice(0, -1);
						}
						let full: string;
						try { 
							full = new URL(`${base}/${loc}`).toString(); 
						} catch { 
							full = raw; 
						}
						const range = this.getRange(text, keyNode.offset, keyNode.length);
						idRanges.set(full, range);
					}
				}
			}
			if (node.children) {
				for (const child of node.children) {
					walk(child, [node, ...ancestors]);
				}
			}
		};
		walk(ast, []);
		return idRanges;
	}
	
	private attachQuadPositions(quads: Quad[], idRanges: IdRangeMap): void {
		for (const q of quads) {
			if (q.subject.termType === 'NamedNode') {
				const r = idRanges.get(q.subject.value);
				if (r) {
					(q as any).positionToken = {
					startLine:   r.start.line + 1,
					startColumn: r.start.character + 1,
					endLine:     r.end.line + 1,
					endColumn:   r.end.character + 1,
					};
				}
			}
		}
	}

	private getRange(text: string, offset: number, length: number): Range {
		const start = computeLineColumn(text, offset);
		const end = computeLineColumn(text, offset + length);
		return Range.create(start, end);
	}
	
}

