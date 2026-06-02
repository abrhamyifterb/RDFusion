/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import {
  validateXsdInteger,
  validateXsdDecimal,
  validateXsdFloat,
  validateXsdDouble,
  validateXsdDate,
} from '../../jsonld-xsd-validator.js';
import { Node } from 'jsonc-parser';
import { nodeToRange, walkAst } from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';
import {
  findSiblingPropertyValue,
  jsonStringValue,
  keywordNames,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

const validators: Record<string, (lex: string) => boolean> = {
  'http://www.w3.org/2001/XMLSchema#integer': validateXsdInteger,
  'http://www.w3.org/2001/XMLSchema#decimal': validateXsdDecimal,
  'http://www.w3.org/2001/XMLSchema#float':   validateXsdFloat,
  'http://www.w3.org/2001/XMLSchema#double':  validateXsdDouble,
  'http://www.w3.org/2001/XMLSchema#date':    validateXsdDate,
};

export default class XsdDatatype implements ValidationRule {
  public readonly key = 'xsdTypeCheck';
  private text!: string; 
  private ast!: Node;
  private prefixMap!: Map<string,string>;
  private typeNames = new Set<string>(['@type']);

  init(ctx: any) { 
    this.text = ctx.text; 
    this.ast = ctx.ast; 
    this.prefixMap = ctx.prefixMap ?? new Map<string,string>();
    this.typeNames = keywordNames(this.ast, this.text, '@type');
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        this.typeNames.has(propertyKeyName(this.text, node) ?? '')
      ) {
        const dtNode = node.children[1];
        const dt = jsonStringValue(this.text, dtNode);
        if (!dt || dt.startsWith('@')) return;

        const lexEntry = findSiblingPropertyValue(node.parent, this.text, new Set(['@value']));
        const fullIri = this.expandPrefix(dt);

        if (lexEntry && validators[fullIri]) {
          const lexNode = lexEntry;
          const lex = jsonStringValue(this.text, lexNode);
          if (lex !== undefined && !validators[fullIri](lex)) {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, lexNode),
              `Invalid lexical form for <${dt}>: "${lex}".`,
              DiagnosticSeverity.Error,
              this.key,
							'RDFusion'
            ));
          }
        }
      }
    });
    return diags;
  }

  private expandPrefix(dt:string) : string {
    if (dt.includes(':') && !/^https?:\/\//.test(dt)) {
      const [prefix, local] = dt.split(':',2);
      const ns = this.prefixMap.get(prefix);
      if (ns) {
        return `${ns}${local}`;
      }
    } 

    return dt;
  }
}
