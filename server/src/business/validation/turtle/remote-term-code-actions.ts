import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  TextEdit,
  type Diagnostic,
} from 'vscode-languageserver/node.js';
import {
  REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE,
  type RemoteTermDiagnosticData,
} from '../remote-term-diagnostics.js';

function isRemoteTermDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.code === REMOTE_TERM_VOCABULARY_DIAGNOSTIC_CODE;
}

function diagnosticData(diagnostic: Diagnostic): RemoteTermDiagnosticData | undefined {
  const data = diagnostic.data as Partial<RemoteTermDiagnosticData> | undefined;
  if (!data?.suggestions?.length || !data.prefix || !data.term) return undefined;
  return data as RemoteTermDiagnosticData;
}

export class RemoteTermCodeActionProvider {
  public provideCodeActions(params: CodeActionParams): CodeAction[] {
    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics ?? []) {
      if (!isRemoteTermDiagnostic(diagnostic)) continue;
      const data = diagnosticData(diagnostic);
      if (!data) continue;

      data.suggestions.slice(0, 5).forEach((suggestion, index) => {
        actions.push({
          title: `Replace with ${suggestion.curie}`,
          kind: CodeActionKind.QuickFix,
          isPreferred: index === 0,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [TextEdit.replace(diagnostic.range, suggestion.curie)],
            },
          },
        });
      });
    }
    return actions;
  }
}
