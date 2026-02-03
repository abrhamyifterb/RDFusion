import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

export default class ReservedKeywordRedefinition implements ValidationRule {
  public readonly key = 'reservedKeywordRedefinition';
  private ast!: Node;
  private text!: string;

  private readonly reserved = new Set([
    '@context', '@id', '@type', '@value', '@language',
    '@base', '@vocab', '@direction', '@version',
    '@container', '@list', '@set', '@reverse', '@graph', '@index', '@included',
    '@nest', '@prefix', '@propagate', '@protected', '@import',
    '@json', '@none'
  ]);

  private readonly contextDirectives: Record<string, (n: Node) => boolean> = {
    '@language': n => n?.type === 'string' || n?.type === 'null',
    '@base':     n => n?.type === 'string' || n?.type === 'null',
    '@vocab':    n => n?.type === 'string' || n?.type === 'null',
    '@direction': n => {
      if (!n) {return false;}
      if (n.type === 'null') {return true;}
      if (n.type !== 'string') {return false;}
      const v = JSON.parse(nodeText(this.text, n));
      return v === 'ltr' || v === 'rtl';
    },
    '@version':   n => n?.type === 'number',
    '@propagate': n => n?.type === 'boolean',
    '@protected': n => n?.type === 'boolean',
    '@import':    n => n?.type === 'string'
  };

  init(ctx: { ast: Node; text: string }) {
    this.ast = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];

    const validateContextObject = (ctxObj: Node) => {
      if (ctxObj?.type !== 'object') {return;}

      for (const termProp of ctxObj.children ?? []) {
        if (!Array.isArray(termProp.children) || termProp.children.length < 2) {continue;}

        const keyNode = termProp.children[0];
        const valNode = termProp.children[1];
        const term = nodeText(this.text, keyNode).slice(1, -1);

        if (!term.startsWith('@')) {continue;}

        const directiveValidator = this.contextDirectives[term];
        if (directiveValidator) {
          if (!directiveValidator(valNode)) {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, valNode),
              `Invalid value for JSON-LD context directive "${term}".`,
              DiagnosticSeverity.Error,
              'RDFusion'
            ));
          }
          continue;
        }

        const msg = this.reserved.has(term)
          ? `JSON-LD keyword "${term}" is not allowed as a term in "@context".`
          : `Unknown JSON-LD keyword "${term}" is not allowed in "@context".`;

        diags.push(Diagnostic.create(
          nodeToRange(this.text, keyNode),
          msg,
          DiagnosticSeverity.Error,
          'RDFusion'
        ));
      }
    };

    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) && node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@context"'
      ) {
        const ctxNode = node.children[1];

        if (ctxNode?.type === 'object') {validateContextObject(ctxNode);}
        if (ctxNode?.type === 'array') {
          for (const child of ctxNode.children ?? []) {
            if (child?.type === 'object') {validateContextObject(child);}
          }
        }
      }
    });

    return diags;
  }
}
