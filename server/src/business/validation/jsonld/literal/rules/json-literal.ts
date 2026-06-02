/* eslint-disable @typescript-eslint/no-explicit-any */
import { Diagnostic } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';

export default class JsonLiteral implements ValidationRule {
  public readonly key = 'jsonLiteralCheck';
  private ast!: Node;

  init(ctx: any) { 
    this.ast = ctx.ast; 
  }

  run(): Diagnostic[] {
    void this.ast;
    return [];
  }
}
