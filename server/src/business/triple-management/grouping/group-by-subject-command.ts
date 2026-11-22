import { Connection, TextEdit, TextDocuments } from 'vscode-languageserver';
import { DataManager } from '../../../data/data-manager';
import { GroupFormatter } from './turtle/group-by-subject.js';
import { ParsedGraph } from '../../../data/irdf-parser';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../parsed-document-helper.js';
import {
  assertTurtleCommentsPreserved,
  createTurtleCommentPlan,
  restoreTurtleComments,
  TurtleCommentPreservationError,
} from '../formatting/turtle/turtle-comment-preserver.js';

export class GroupBySubjectCommand {
  constructor(
    private dataManager:    DataManager,
    private connection:     Connection,
    private documents:      TextDocuments<TextDocument>
  ) {}

  public async execute(args: { uri: string }): Promise<void> {
    try {
      const uri    = args.uri;
      const doc = this.documents.get(uri);
      if (!doc) {return;}
      const parsed = await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | undefined;
      if (!parsed) {
        this.connection.console.error(`[Group by Subject] Could not group because no parsed RDF data is available for ${uri}`);
        return;
      }

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[Group by Subject] Could not group because the RDF document has parse errors: ${uri}`);
				return;
			}

      const commentCount = parsed.comments?.length ?? 0;
      if (commentCount > 0) {
        const proceedTitle = 'Group and preserve comments';
        const choice = await this.connection.window.showWarningMessage(
          `This document contains ${commentCount} Turtle comment${commentCount === 1 ? '' : 's'}. Comment text will be preserved, but inline comments may move to a nearby standalone line.`,
          { title: proceedTitle },
          { title: 'Cancel' },
        );
        if (choice?.title !== proceedTitle) {return;}
      }

      const commentPlan = createTurtleCommentPlan(doc.getText(), parsed);
      const groupFormatter = new GroupFormatter();
      const groupedWithoutComments = groupFormatter.group(parsed, commentPlan.commentsBeforeSubject);
      const groupedText = restoreTurtleComments(groupedWithoutComments, commentPlan);
      assertTurtleCommentsPreserved(groupedText, parsed.comments ?? []);

      if (this.documents.get(uri)?.version !== doc.version) {
        this.connection.window.showWarningMessage('Grouping was cancelled because the document changed while grouping.');
        return;
      }
      const fullRange = fullDocumentRange(doc);

      await this.connection.workspace.applyEdit({
        changes: { [uri]: [ TextEdit.replace(fullRange, groupedText) ] }
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error instanceof TurtleCommentPreservationError) {
        this.connection.window.showWarningMessage(error.message);
      }
      this.connection.console.error(`[Group by Subject] Failed to group triples: ${error.message || error.toString()}`);
      console.error(`[Group by Subject] Failed to group triples: ${error.message || error.toString()}`);
      return;
    }
  }
}
