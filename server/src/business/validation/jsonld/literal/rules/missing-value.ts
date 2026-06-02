import { Diagnostic } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

export default class MissingValue implements ValidationRule {
  public readonly key = 'missingValueCheck';
  private ast!: Node;

  public init(ctx: { text: string; ast: Node }) {
    this.ast = ctx.ast;
  }

  public run(): Diagnostic[] {
    void this.ast;
    return [];
  }
}
