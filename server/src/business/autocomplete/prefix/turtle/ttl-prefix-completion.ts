import {
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocuments,
	Connection
} from 'vscode-languageserver';
import { TextDocument }      from 'vscode-languageserver-textdocument';
import { ICompletionProvider } from '../../icompletion-provider';
import { PrefixRegistry } from '../prefix-registry';
import { declarePrefixAtTop } from './declare-at-top.js';
import { RDFusionConfigSettings } from '../../../../utils/irdfusion-config-settings';

export class TtlPrefixCompletionProvider implements ICompletionProvider {
	private configSettings: RDFusionConfigSettings;
	constructor(
		private registry: PrefixRegistry,
		private connection: Connection,
		initialSettings: RDFusionConfigSettings
	) {
		this.configSettings = initialSettings;
	}

	public async provide(
			params: TextDocumentPositionParams,
			documents: TextDocuments<TextDocument>
		): Promise<CompletionItem[]> {
		const uri = params.textDocument.uri;
		const doc  = documents.get(params.textDocument.uri);
		if (!doc) return [];
		
		const line = doc.getText({
			start: { line: params.position.line, character: 0 },
			end: params.position
		}).trim();
	
		if (/^@prefix$/.test(line) || /^@?$/.test(line)) {
			return this.registry.getAll().map(({prefix, iri}) => ({
				label: prefix,
				kind: CompletionItemKind.Module,
				detail: iri,
				insertText: `prefix ${prefix}: <${iri}> .\n`,
			}));
		}
	
		const m = line.match(/([A-Za-z][\w-]*):$/);
		if (!m) return [];

		if(this.configSettings.turtle.autocomplete['prefixDeclaration']) {
			const pfx = m[1];
			const iri = await this.registry.ensure(pfx);
			if (iri) {
				declarePrefixAtTop(uri, pfx, iri, doc, this.connection.workspace.applyEdit.bind(this.connection.workspace));
			}
		}
	
		return [];
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
