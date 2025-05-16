import { Diagnostic, TextDocuments } from "vscode-languageserver/node";
import { DataManager } from "../../data/data-manager";
import { IRdfValidator } from './irdf-validator';
import { TurtleValidator } from './turtle/ttl-validator.js';
import { ShaclValidator } from './shacl-validator.js';
import { ShapeManager } from '../../data/shacl/shape-manager';
import { JsonLdValidator } from './jsonld/jsonld-validator.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { RDFusionConfigSettings } from '../../utils/irdfusion-config-settings';

export class ValidationManager {
	private validator: IRdfValidator | undefined;
	private shaclValidator: ShaclValidator;
	private configSettings: RDFusionConfigSettings;

	constructor(
		private dataManager: DataManager, 
		private shapeManager: ShapeManager,
		private documents: TextDocuments<TextDocument>,
		initialSettings: RDFusionConfigSettings
	) {
		this.shaclValidator = new ShaclValidator(this.shapeManager);
		this.configSettings = initialSettings;
	}

	async validate(uri: string): Promise<Diagnostic[]> {
		// console.log(`inside validation-manager settings: ${JSON.stringify(this.configSettings)}`);
		const fileType = this.findFileFormat(uri);
		this.validator = fileType === "turtle" 
			? new TurtleValidator(this.dataManager, this.documents, this.configSettings) 
			: new JsonLdValidator(this.dataManager, this.documents, this.configSettings);
		return this.validator.validate(uri, this.shaclValidator);
	}

	findFileFormat(uri: string): string {
		return uri.toLowerCase().endsWith(".ttl") ? "turtle" :
						uri.toLowerCase().endsWith(".jsonld") ? "jsonld" : "unknown";
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
