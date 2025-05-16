/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node } from 'jsonc-parser';
import { Diagnostic, Range } from 'vscode-languageserver/node';

export interface CachedParsedGraph {
  version: number;
  parsedGraph: ParsedGraph | JsonldParsedGraph;
}

export interface ParsedGraph {
  quads: any[];
  tokens: any[];
  prefixes?: Record<string,string>;
  errors?: any[];
}

export interface Definition {
	id: string;
	range: Range;
	typeIri?: string;
	typeRange?: Range;
}

export interface JsonldParsedGraph {
  text: string;
  ast: Node;
  contextMap: Map<string,string>;
  definitions: Definition[];
  quads: any[];
  diagnostics: Diagnostic[];
}

export interface IRDFParser {
  parse(input: string): Promise<ParsedGraph | JsonldParsedGraph>;
  update?(changedRange: Range, newInput: string): Promise<ParsedGraph | JsonldParsedGraph>;
}

