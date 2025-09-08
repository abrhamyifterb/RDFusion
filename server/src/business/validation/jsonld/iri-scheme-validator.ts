/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-useless-escape */
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import URI from 'uri-js';
import { getIanaSchemes } from '../iana-schemes.js';
//import { ValidationRule } from '../utils.js';
import { walkAst, nodeText, nodeToRange } from './syntax/utils.js';
import { IriExpectationIndex } from '../../autocomplete/prefix/jsonld/iri-expectation-index.js';


export default class JsonLdIriSchemeCheck  {
  public readonly key = 'iriSchemeCheck';
  private ast!: Node;
  private text!: string;
  private iana = new Set<string>();
  private enabled = true;

  public async init(ctx: { ast: Node; text: string; enabled?: boolean }, cfg: any) {
    this.ast = ctx.ast;
    this.text = ctx.text;
    if (typeof ctx.enabled === 'boolean') {this.enabled = ctx.enabled;}

    if (!this.enabled) { 
      this.iana = new Set(); return; 
    }
    try {
      if (cfg.strictSchemeCheck) {
				this.iana = new Set(
					cfg.customIriScheme.split(',').map((s: string) => s.trim())
				);
      } else {
        this.iana = await getIanaSchemes(); 
      }
    } catch {
      this.iana = new Set(); 
    }
  }

  public run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    if (this.iana.size === 0) {return diags;} 

    const index = new IriExpectationIndex();
    index.init({ text: this.text, ast: this.ast });

    walkAst(this.ast, node => {
      if (node?.type === 'property' && node.children?.length === 2) {
        const keyNode = node.children[0];
        if (keyNode?.type === 'string' && index.keyIsIriExpected(keyNode)) {
          let keyStr: string;
          try { keyStr = JSON.parse(nodeText(this.text, keyNode)); } catch { keyStr = ''; }
          if (keyStr && index.looksAbsoluteIri(keyStr, keyNode)) {
            this.validateAbsoluteIri(keyStr, keyNode, diags);
          }
        }
      }

      if (node?.type === 'string' && index.isIriValueStringNode(node)) {
        let val: string;
        try { val = JSON.parse(nodeText(this.text, node)); } catch { val = ''; }
        if (val && index.looksAbsoluteIri(val, node)) {
          this.validateAbsoluteIri(val, node, diags);
        }
      }
    });

    return diags;
  }

  private validateAbsoluteIri(raw: string, node: Node, out: Diagnostic[]) {
    const range = nodeToRange(this.text, node);
    const parsed = URI.parse(raw);
    if (parsed.error) {
      out.push(Diagnostic.create(
        range,
        `Invalid IRI syntax: ${parsed.error}`,
        DiagnosticSeverity.Warning,
        this.key
      ));
      return;
    }
    const scheme = (parsed.scheme || '').toLowerCase();
    if (scheme && !this.iana.has(scheme)) {
      out.push(Diagnostic.create(
        range,
        `Scheme "${scheme}:" is not registered with IANA.`,
        DiagnosticSeverity.Warning,
        this.key
      ));
    }
  }
}
