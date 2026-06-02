import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { walkAst, nodeText, nodeToRange } from '../utils.js';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { hasJsonTypeMapping, keywordNames } from '../../jsonld-keyword-utils.js';

const SCALARS = new Set<Node['type']>(['string','number','boolean','null']);

export default class ValueScalar implements ValidationRule {
  public readonly key = 'valueScalarCheck';
  private text!: string;
  private ast!: Node;
  private typeNames = new Set<string>(['@type']);

  public init(ctx: { text: string; ast: Node }) {
    this.text = ctx.text;
    this.ast  = ctx.ast;
    this.typeNames = keywordNames(this.ast, this.text, '@type');
  }

  public run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    walkAst(this.ast, node => {
      if (
        node?.type === 'property' &&
        Array.isArray(node.children) &&
        node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@value"'
      ) {
        const val = node.children[1];
        if (!SCALARS.has(val?.type) && !hasJsonTypeMapping(node.parent, this.text, this.typeNames)) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, val),
            '`@value` must be a scalar unless the value object is typed as `@json`.',
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
        }
      }
    });
    return diags;
  }
}
