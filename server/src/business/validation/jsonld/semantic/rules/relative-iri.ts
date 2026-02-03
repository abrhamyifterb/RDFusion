import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';
import { Node } from 'jsonc-parser';

export default class RelativeIriCheck implements ValidationRule {
  public readonly key = 'relativeIri';
  private ast!: Node;
  private text!: string;

  private contextSpans: { start: number; end: number }[] = [];

  private baseValue: string | null | undefined;

  init(ctx: { ast: Node; text: string }) {
    this.ast = ctx.ast;
    this.text = ctx.text;

    this.contextSpans = [];
    this.baseValue = undefined;

    let firstContextNode: Node | null = null;

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const val = node.children[1];
        if (!val) {return;}

        this.contextSpans.push({ start: val.offset, end: val.offset + val.length });

        if (!firstContextNode || val.offset < firstContextNode.offset) {
          firstContextNode = val;
        }
      }
    });

    if (firstContextNode) {
      this.baseValue = this.extractBase(firstContextNode);
    }
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@id"'
      ) {
        const val = node.children[1];
        if (!val || val.type !== 'string') {return;}

        if (this.isInsideAnyContext(val.offset)) {return;}

        const str = JSON.parse(nodeText(this.text, val));

        if (this.isNonRelativeId(str)) {return;}

        // Relative @id without @base
        if (this.baseValue === undefined || this.baseValue === null) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            `Relative IRI "${str}" used but no @base defined to resolve it.`,
            DiagnosticSeverity.Error,
            'RDFusion'
          ));
        }
      }
    });

    return diags;
  }

  private isInsideAnyContext(offset: number): boolean {
    return this.contextSpans.some(s => offset >= s.start && offset < s.end);
  }

  private isNonRelativeId(str: string): boolean {
    if (str.startsWith('_:')) {return true;}

    const colon = str.indexOf(':');
    if (colon === -1) {return false;}

    // eslint-disable-next-line no-useless-escape
    const m = /[\/?#]/.exec(str);
    const firstDelim = m ? m.index : Number.POSITIVE_INFINITY;

    return colon < firstDelim;
  }

  private extractBase(ctxNode: Node): string | null | undefined {
    if (!ctxNode) {return undefined;}

    if (ctxNode.type === 'null') {return null;}

    if (ctxNode.type === 'array' && Array.isArray(ctxNode.children)) {
      let base: string | null | undefined = undefined;
      for (const child of ctxNode.children) {
        const b = this.extractBase(child);
        if (b !== undefined) {base = b;}
      }
      return base;
    }

    if (ctxNode.type === 'object' && Array.isArray(ctxNode.children)) {
      for (const prop of ctxNode.children) {
        if (
          prop?.type === 'property' &&
          Array.isArray(prop.children) && prop.children.length >= 2
        ) {
          const [keyNode, valNode] = prop.children;
          if (nodeText(this.text, keyNode) === '"@base"') {
            if (valNode?.type === 'string') {return JSON.parse(nodeText(this.text, valNode));}
            if (valNode?.type === 'null') {return null;}
          }
        }
      }
    }

    return undefined;
  }
}
