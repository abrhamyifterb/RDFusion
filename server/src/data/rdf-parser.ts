import { Range } from 'vscode-languageserver/node.js';
import { IRDFParser, JsonldParsedGraph, ParsedGraph } from "./irdf-parser";
import MillianRDFParser from "./turtle/ttl-parser.js";
import { JsonLdParser } from './jsonld/jsonld-parser.js';

export class RDFParser {
  private parser!: IRDFParser;

  async parse(input: string, fileType: string): Promise<ParsedGraph | JsonldParsedGraph> {
    if (fileType === 'turtle') {
      const parser = new MillianRDFParser();
      return parser.parse(input);
    } else if (fileType === 'jsonld') {
      const parser = new JsonLdParser();
      return parser.parse(input);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  update(changedRange: Range, newInput: string): Promise<ParsedGraph | JsonldParsedGraph> {
    if (this.parser.update) {
      return this.parser.update(changedRange, newInput);
    }
    return Promise.reject(new Error("Incremental update not implemented."));
  }
}
