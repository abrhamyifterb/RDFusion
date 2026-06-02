import { Node } from 'jsonc-parser';
import { ValidationRule } from '../../../utils.js';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { walkAst, nodeText, nodeToRange } from '../../syntax/utils.js';

function ancestorPropertyKey(text: string, node: Node | undefined): string | undefined {
	let current = node?.parent;
	while (current) {
		if (current.type === 'property' && current.children?.[0]) {
			return nodeText(text, current.children[0]).slice(1, -1);
		}
		current = current.parent;
	}
	return undefined;
}

function isInsideContextTermDefinition(text: string, typeProperty: Node): boolean {
	const termValueObject = typeProperty.parent;
	const termProperty = termValueObject?.parent;
	const contextObject = termProperty?.parent;
	const contextProperty = contextObject?.parent;
	return termValueObject?.type === 'object'
		&& termProperty?.type === 'property'
		&& contextObject?.type === 'object'
		&& contextProperty?.type === 'property'
		&& ancestorPropertyKey(text, contextObject) === '@context';
}

export class TypeMappingCheck implements ValidationRule {
  public readonly key = 'typeMapping';
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
        node.children.length >= 2 &&
        nodeText(this.text, node.children[0]) === '"@type"'
      ) {
        const valNode = node.children[1];
        const inTermDefinition = isInsideContextTermDefinition(this.text, node);
        if (inTermDefinition) {
          if (valNode?.type !== 'string') {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, valNode),
              '`@type` in a JSON-LD term definition must be a string.',
              DiagnosticSeverity.Error,
              this.key,
							'RDFusion'
            ));
          }
          return;
        }

        const check = (n: Node) => {
          if (n?.type !== 'string') {
            diags.push(Diagnostic.create(
              nodeToRange(this.text, n),
              '`@type` value must be a string or an array of strings.',
              DiagnosticSeverity.Error,
              this.key,
							'RDFusion'
            ));
          }
        };

        if (valNode?.type === 'array') {
          for (const item of valNode.children ?? []) {
            check(item);
          }
        } else {
          check(valNode);
        }
      }
    });
    return diags;
  }
}
