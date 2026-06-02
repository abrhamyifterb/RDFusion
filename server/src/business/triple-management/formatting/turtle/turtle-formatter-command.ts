/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, TextDocuments, TextEdit } from 'vscode-languageserver';
import { DataManager } from '../../../../data/data-manager';
import { ParsedGraph } from '../../../../data/irdf-parser';
import { fullDocumentRange, getParsedGraphForCommand, hasParseDiagnostics } from '../../parsed-document-helper.js';
import { RDFusionConfigSettings } from '../../../../utils/irdfusion-config-settings';
import { PrefixRegistry } from '../../../autocomplete/prefix/prefix-registry';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TurtleFormatter } from './turtle-formatter';



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

			const formattedText = await new TurtleFormatter().format(parsed, this.registry, this.configSettings.turtle.formatting);
			
			const fullRange = fullDocumentRange(doc);

			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, formattedText) ] }
			});
		} catch (error: any) {
			this.connection.console.error(`[Turtle Formatter] Failed to format Turtle: ${error.message || error.toString()}`);
			console.error(`[Turtle Formatter] Failed to format Turtle: ${error.message || error.toString()}`);
			return;
		}
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
		
	}
}

