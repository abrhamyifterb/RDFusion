import { IRDFParser, ParsedGraph } from "../irdf-parser";
import { TurtleCstToQuadsVisitor } from "./cst-to-quads-visitor.js";
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node.js';
import { ExposedTurtleParser } from './exposed-turtle-parser.js';

export default class MillianRDFParser implements IRDFParser {
  private millianParser: ExposedTurtleParser;
  
  constructor() {
    this.millianParser = new ExposedTurtleParser();
  }
  
  async parse(input: string): Promise<ParsedGraph> {
    try {
      const millianResult = this.millianParser.parse(input);
      let prefixes = {} ;
      let tokens: unknown[] = [];
      let quads: unknown[] = [];
      
      if (!(millianResult.errors.length > 0)) {
          prefixes = this.millianParser.getNamespacesMap();
          try {
          const visitor = new TurtleCstToQuadsVisitor(prefixes);
          
          const baseValue = this.millianParser.getBase();
          if (baseValue) {
            visitor.base = baseValue; 
          }
          
          tokens = visitor.extractTokens(millianResult.cst);
          quads = visitor.visitTurtleDoc(millianResult.cst);
        }
        catch (error:unknown) {
          console.dir(`Millian visitor parser error: => ${JSON.stringify(error)}`);
          //return Promise.reject(new Error("Millian visitor parser error: " + error));
        }
      }
      return {
        quads,
        tokens,
        prefixes,
        errors: [...millianResult.errors, ...millianResult.semanticErrors],
      };
    } catch (error:unknown) {
      // console.dir(`Millian parser error: => ${JSON.stringify(error)}`);
      console.error('Error while parsing:', error);
      const diagnostics: Diagnostic[] = [];
      
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorDetails = JSON.parse(errorMessage);
    
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        errorDetails.forEach((err: { name: string; message: string; token: any; }) => {
          const range: Range = {
            start: { line: err.token.startLine - 1, character: err.token.startColumn - 1 },
            end: { line: err.token.endLine - 1, character: err.token.endColumn - 1 }
          };
          const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range,
            message: `RDF Parsing Error: ${err.message}`,
            source: 'Millian Parser',
          };
          diagnostics.push(diagnostic);
        });
      }
      // console.log(`Millian parser error: ${JSON.stringify(diagnostics)}`);
      return Promise.reject(new Error(`Millian parser error: ${JSON.stringify(diagnostics)}`));
      //return Promise.reject(new Error("Millian parser error: " + error));
    }
  }
  
  async update(changedRange: Range, newInput: string): Promise<ParsedGraph> {
    return this.parse(newInput);
  }
}
