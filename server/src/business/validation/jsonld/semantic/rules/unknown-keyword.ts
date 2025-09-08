import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule }               from '../../../utils';
import { Node }                         from 'jsonc-parser';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

const VALID_KEYWORDS = new Set([
  '@context','@id','@type','@value','@language', '@container',
  '@list','@set','@reverse','@graph','@index',
  '@base','@vocab','@direction','@nest', '@included', 
  '@version', '@propagate', '@protected', '@import', '@none'
]);

export default class UnknownKeywordCheck implements ValidationRule {
  public readonly key = 'unknownKeyword';
  private ast!: Node;
  private text!: string;

  init(ctx: { ast: Node; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 1
      ) {
        const keyNode = node.children[0];
        const raw = nodeText(this.text, keyNode);
        const key = raw.slice(1, -1);
        if (key.startsWith('@') && !VALID_KEYWORDS.has(key)) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, keyNode),
            `Unknown JSON-LD keyword "${key}".`,
            DiagnosticSeverity.Warning,
            'RDFusion'
          ));
        }
      }
    });
    return diags;
  }
}
