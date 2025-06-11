/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection, Position, Range, TextDocuments, TextEdit } from 'vscode-languageserver';
import { DataManager } from '../../../../data/data-manager';
import { ParsedGraph } from '../../../../data/irdf-parser';
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

			const parsed = this.dataManager.getParsedData(uri) as ParsedGraph | undefined;

			if (!parsed) {
				this.connection.console.error(`[Turtle Formatter] No parsed data for ${uri}`);
				return;
			}

			if (('errors' in parsed && parsed.errors?.length)) {
				this.connection.console.error(`[Turtle Formatter] Error during parsing data for ${uri}`);
				return;
			}

			const formattedText = await new TurtleFormatter().format(parsed, this.registry, this.configSettings.turtle.formatting);
			
			const fullRange: Range = {
				start: Position.create(0, 0),
				end:   Position.create(doc.lineCount - 1, doc.getText().split('\n').pop()!.length)
			};

			await this.connection.workspace.applyEdit({
				changes: { [uri]: [ TextEdit.replace(fullRange, formattedText) ] }
			});
		} catch (error: any) {
			this.connection.console.error(`[Turtle Formatter] Failed to process:  ${error.message || error.toString()}`);
			console.error(`[Turtle Formatter] Failed to process: ${error.message || error.toString()}`);
			return;
		}
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
		
	}
}

