/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, TextDocuments, TextEdit } from 'vscode-languageserver';
import { DataManager } from '../../../../data/data-manager';
import { ParsedGraph } from '../../../../data/irdf-parser';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../../parsed-document-helper.js';
import { RDFusionConfigSettings } from '../../../../utils/irdfusion-config-settings';
import { PrefixRegistry } from '../../../autocomplete/prefix/prefix-registry';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TurtleFormatter } from './turtle-formatter';
import { TurtleCommentPreservationError } from './turtle-comment-preserver.js';
import {
	assertTurtleTransformationSafe,
	TurtleTransformationSafetyError,
} from './turtle-transformation-verifier.js';



export class TurtleFormatterCommand {
	private configSettings: RDFusionConfigSettings;
	constructor(
		private dataManager: DataManager,
		private connection: Connection,
		private documents: TextDocuments<TextDocument>,
		private registry: PrefixRegistry,
		initialSettings: RDFusionConfigSettings
	) {
		this.configSettings = initialSettings;
	}

	async format(args: { uri: string }): Promise<void> {
		try {
			const uri    = args.uri;
			const doc = this.documents.get(uri);
			if (!doc) { return; }

			const parsed = await getParsedGraphForCommand(this.dataManager, this.documents, uri) as ParsedGraph | undefined;

			if (!parsed) {
				this.connection.console.error(`[Turtle Formatter] Could not format because no parsed RDF data is available for ${uri}`);
				return;
			}

			if (hasParseDiagnostics(parsed)) {
				this.connection.console.error(`[Turtle Formatter] Could not format because the RDF document has parse errors: ${uri}`);
				return;
			}

			const commentCount = parsed.comments?.length ?? 0;
			if (commentCount > 0) {
				const proceedTitle = 'Format and preserve comments';
				const choice = await this.connection.window.showWarningMessage(
					`This document contains ${commentCount} Turtle comment${commentCount === 1 ? '' : 's'}. Comment text will be preserved, but inline comments may move to a nearby standalone line.`,
					{ title: proceedTitle },
					{ title: 'Cancel' },
				);
				if (choice?.title !== proceedTitle) {return;}
			}

			const formattedText = await new TurtleFormatter().format(
				parsed,
				this.registry,
				this.configSettings.turtle.formatting,
				doc.getText(),
			);
			await assertTurtleTransformationSafe(doc.getText(), formattedText, uri, this.connection);

			if (this.documents.get(uri)?.version !== doc.version) {
				this.connection.window.showWarningMessage('Turtle formatting was cancelled because the document changed while formatting.');
				return;
			}
			
			const fullRange = fullDocumentRange(doc);

			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, formattedText) ] }
			});
		} catch (error: any) {
			if (
				error instanceof TurtleCommentPreservationError
				|| error instanceof TurtleTransformationSafetyError
			) {
				this.connection.window.showWarningMessage(error.message);
			}
			this.connection.console.error(`[Turtle Formatter] Failed to format Turtle: ${error.message || error.toString()}`);
			console.error(`[Turtle Formatter] Failed to format Turtle: ${error.message || error.toString()}`);
			return;
		}
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
		
	}
}

