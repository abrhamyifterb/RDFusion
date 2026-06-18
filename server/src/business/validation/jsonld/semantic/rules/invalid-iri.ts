/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import URI                                from 'uri-js';
import { Node }                          from 'jsonc-parser';
import { walkAst, nodeToRange } from '../../syntax/utils.js';
import { ValidationRule }                from '../../../utils.js';
import { getIanaSchemes }                from '../../../iana-schemes.js';
import type { ResolvedContext } from '../../../../../data/jsonld/active-context-resolver.js';
import {
  collectContextValueSpans,
  jsonStringValue,
  activeJsonLdContextAt,
  isJsonLdKeywordAt,
  offsetInSpans,
  propertyKeyName,
} from '../../jsonld-keyword-utils.js';

const TYPE_KEYWORDS = new Set(['@id', '@json', '@none', '@vocab']);

export default class InvalidIri implements ValidationRule {
  public readonly key = 'invalidIriCheck';

  private text!: string;
  private ast!: Node;
  private prefixMap!: Map<string,string>;
  private iana = new Set<string>();
  private contextSpans: { start: number; end: number }[] = [];
  private resolvedContext?: ResolvedContext;

  public async init(ctx: { text: string; ast: Node; prefixMap?: Map<string,string>; resolvedContext?: ResolvedContext }) {
    this.text       = ctx.text;
    this.ast        = ctx.ast;
    this.prefixMap = ctx.prefixMap ?? new Map<string,string>();
    this.contextSpans = collectContextValueSpans(this.ast, this.text);
    this.resolvedContext = ctx.resolvedContext;
    try {
      this.iana = await getIanaSchemes();
    } catch {
      this.iana = new Set();
    }
  }

  public run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
  
    const checkIri = (iri: string, range: any, severity: DiagnosticSeverity, offset: number) => {
      if (iri.startsWith('_:') || TYPE_KEYWORDS.has(iri)) return;
    
      const parsed = URI.parse(iri);
      if (parsed.error) {
        diags.push(Diagnostic.create(
          range,
          `Invalid IRI syntax: ${parsed.error}`,
          severity,
          this.key
        ));
        return;
      }
    
      let scheme = (parsed.scheme || '').toLowerCase();
      if (scheme.endsWith(':')) {
        scheme = scheme.slice(0, -1);
      }
    
      if (scheme && this.iana.has(scheme)) {
        return;  
      }
    
      if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(iri)) {
        return;
      }
    
      if (iri.includes(':')) {
        const [prefix] = iri.split(':', 1);
        const active = activeJsonLdContextAt(
          this.ast,
          this.text,
          offset,
          this.resolvedContext,
        );
        if (!active.prefixMap.has(prefix) && !this.prefixMap.has(prefix)) {
          diags.push(Diagnostic.create(
            range,
            `Undefined prefix "${prefix}" in IRI "${iri}".`,
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
        }
        return;
      }
    };
  
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length === 2
      ) {
        if (offsetInSpans(node.offset, this.contextSpans)) return;
        const key = propertyKeyName(this.text, node);
        const val = node.children[1];
    
        const isIdKey = isJsonLdKeywordAt(
          this.ast,
          this.text,
          key,
          node.children[0].offset,
          '@id',
          this.resolvedContext,
        );
        const isTypeKey = isJsonLdKeywordAt(
          this.ast,
          this.text,
          key,
          node.children[0].offset,
          '@type',
          this.resolvedContext,
        );
        if (isIdKey || isTypeKey) {
          const severity = isIdKey ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
          if (val?.type === 'string') {
            const iri = jsonStringValue(this.text, val);
            if (iri !== undefined) checkIri(iri, nodeToRange(this.text, val), severity, node.children[0].offset);
          }
          else if (val?.type === 'array') {
            for (const elt of val.children || []) {
              if (elt?.type === 'string') {
                const iri = jsonStringValue(this.text, elt);
                if (iri !== undefined) checkIri(iri, nodeToRange(this.text, elt), severity, node.children[0].offset);
              }
            }
          }
        }
      }
    });
  
    return diags;
  }
}
