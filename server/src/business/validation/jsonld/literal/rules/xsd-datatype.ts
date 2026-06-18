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
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  jsonStringValue,
  activeJsonLdContextAt,
  isJsonLdKeywordAt,
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
  private resolvedContext?: ResolvedContext;

  init(ctx: any) { 
    this.text = ctx.text; 
    this.ast = ctx.ast; 
    this.prefixMap = ctx.prefixMap ?? new Map<string,string>();
    this.resolvedContext = ctx.resolvedContext;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        isJsonLdKeywordAt(
          this.ast,
          this.text,
          propertyKeyName(this.text, node),
          node.children[0].offset,
          '@type',
          this.resolvedContext,
        )
      ) {
        const dtNode = node.children[1];
        const dt = jsonStringValue(this.text, dtNode);
        if (!dt || dt.startsWith('@')) return;

        const lexEntry = this.findValueNode(node.parent);
        const fullIri = this.expandPrefix(dt, node.children[0].offset);

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

  private findValueNode(parent: Node | undefined): Node | undefined {
    if (parent?.type !== 'object') return undefined;
    for (const sibling of parent.children ?? []) {
      if (
        sibling?.type === 'property' &&
        Array.isArray(sibling.children) &&
        sibling.children.length >= 2 &&
        isJsonLdKeywordAt(
          this.ast,
          this.text,
          propertyKeyName(this.text, sibling),
          sibling.children[0].offset,
          '@value',
          this.resolvedContext,
        )
      ) {
        return sibling.children[1];
      }
    }
    return undefined;
  }

  private expandPrefix(dt:string, offset: number) : string {
    if (dt.includes(':') && !/^https?:\/\//.test(dt)) {
      const [prefix, local] = dt.split(':',2);
      const active = activeJsonLdContextAt(this.ast, this.text, offset, this.resolvedContext);
      const ns = active.prefixMap.get(prefix) ?? this.prefixMap.get(prefix);
      if (ns) {
        return `${ns}${local}`;
      }
    } 

    return dt;
  }
}
