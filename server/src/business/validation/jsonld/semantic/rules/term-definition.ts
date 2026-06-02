import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { ValidationRule } from '../../../utils.js';
import { nodeToRange } from '../../syntax/utils.js';
import { findJsonLdContextObjects, jsonStringNodeValue } from '../../../../../utils/shared/jsonld/context-prefix.js';

export class TermDefinitionTypeCheck implements ValidationRule {
  public readonly key = 'termDefinitionType';
  private ast!: Parameters<typeof findJsonLdContextObjects>[0];
  private text!: string;

  init(ctx: { ast: NonNullable<Parameters<typeof findJsonLdContextObjects>[0]>; text: string }) {
    this.ast  = ctx.ast;
    this.text = ctx.text;
  }

  run(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    for (const ctxNode of findJsonLdContextObjects(this.ast, this.text)) {
      for (const termProp of ctxNode.children ?? []) {
        if (!Array.isArray(termProp.children) || termProp.children.length < 2) continue;
        const term = jsonStringNodeValue(this.text, termProp.children[0]);
        if (!term || term.startsWith('@')) continue;
        const valNode = termProp.children[1];
        if (!['string', 'object', 'null'].includes(valNode?.type)) {
          diags.push(Diagnostic.create(
            nodeToRange(this.text, valNode),
            `Value for context term "${term}" must be a string, an expanded term definition object, or null.`,
            DiagnosticSeverity.Error,
            this.key,
							'RDFusion'
          ));
        }
      }
    }
    return diags;
  }
}
