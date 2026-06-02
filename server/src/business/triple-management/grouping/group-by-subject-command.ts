import { Connection, TextEdit, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { GroupFormatter } from './turtle/group-by-subject.js';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../parsed-document-helper.js';

export class GroupBySubjectCommand {
  constructor(
    private dataManager:    DataManager,
    private connection:     Connection,
    private documents:      TextDocuments<TextDocument>
  ) {}

  public async execute(args: { uri: string }): Promise<void> {
    try {
      const uri    = args.uri;
      const parsed = await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | undefined;
      if (!parsed) {
        this.connection.console.error(`[Group by Subject] Could not group because no parsed RDF data is available for ${uri}`);
        return;
      }

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[Group by Subject] Could not group because the RDF document has parse errors: ${uri}`);
				return;
			}

      const groupFormatter = new GroupFormatter();
    
      const groupedText = groupFormatter.group(parsed);

      const doc = this.documents.get(uri);
      if (!doc) return;
      const fullRange = fullDocumentRange(doc);

      await this.connection.workspace.applyEdit({
        changes: { [uri]: [ TextEdit.replace(fullRange, groupedText) ] }
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.connection.console.error(`[Group by Subject] Failed to group triples: ${error.message || error.toString()}`);
      console.error(`[Group by Subject] Failed to group triples: ${error.message || error.toString()}`);
      return;
    }
  }
}
