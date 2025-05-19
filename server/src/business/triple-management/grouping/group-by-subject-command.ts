import { Connection, 
  TextEdit, 
  Range, 
  Position, 
  TextDocuments 
} from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { GroupFormatter } from './turtle/group-by-subject.js';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TextDocument } from 'vscode-languageserver-textdocument';

export class GroupBySubjectCommand {
  constructor(
    private dataManager:    DataManager,
    private connection:     Connection,
    private documents:      TextDocuments<TextDocument>
  ) {}

  public async execute(args: { uri: string }): Promise<void> {
    const uri    = args.uri;
    const parsed = this.dataManager.getParsedData(uri) as ParsedGraph | undefined;
    if (!parsed) {
      this.connection.console.error(`[Group] No parsed data for ${uri}`);
      return;
    }

	  const groupFormatter = new GroupFormatter();
  
    const groupedText = groupFormatter.group(parsed);

    const doc = this.documents.get(uri);
    if (!doc) return;
    const fullRange: Range = {
      start: Position.create(0, 0),
      end:   Position.create(doc.lineCount - 1, doc.getText().split('\n').pop()!.length)
    };

    await this.connection.workspace.applyEdit({
      changes: { [uri]: [ TextEdit.replace(fullRange, groupedText) ] }
    });
  }
}
