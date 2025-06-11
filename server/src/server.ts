/* eslint-disable @typescript-eslint/no-explicit-any */
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	TextDocumentSyncKind,
	InitializeResult,
	CompletionParams,
	DocumentDiagnosticParams,
	DocumentDiagnosticReport,
	// TextDocumentPositionParams
} from 'vscode-languageserver/node.js';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { Cache } from './data/cache/lru-cache.js';
import { DataManager } from './data/data-manager.js';

import { ValidationManager } from './business/validation/validation-manager.js';
import { ShapeManager } from './data/shacl/shape-manager.js';
import { PrefixRegistry } from './business/autocomplete/prefix/prefix-registry.js';
import { JsonLdPrefixCompletionProvider } from './business/autocomplete/prefix/jsonld/jsonld-prefix-completion.js';
import { TtlPrefixCompletionProvider } from './business/autocomplete/prefix/turtle/ttl-prefix-completion.js';
import { Fetcher } from './business/autocomplete/prefix/fetcher.js';
import { TermProvider } from './business/autocomplete/term-completion/term-provider.js';
import { TtlTermCompletionProvider } from './business/autocomplete/term-completion/ttl-term-completion-provider.js';
import { JsonLdTermCompletionProvider } from './business/autocomplete/term-completion/jsonld-term-completion-provider.js';
//import { ShaclCompletionProvider } from './business/autocomplete/shacl-based/shacl-completion-provider.js';
import { ShaclRegistry } from './business/autocomplete/shacl-based/shacl-registry.js';
import { RDFusionConfigSettings } from './utils/irdfusion-config-settings.js';
import { GroupBySubjectCommand } from './business/triple-management/grouping/group-by-subject-command.js';
import { FilterTriplesCommand } from './business/triple-management/filtering/filter-triples-command.js';
import { VoIDGenerateCommand } from './business/triple-management/void-generate/void-generate-command.js';
import { MergeGroupCommand, MergeParams } from './business/triple-management/merge-files/merge-and-group-command.js';
import { SortTriplesCommand } from './business/triple-management/sorting/sorting-triples-command.js';
import { TurtleFormatterCommand } from './business/triple-management/formatting/turtle/turtle-formatter-command.js';
import { JsonldFrameCommand } from './business/triple-management/formatting/jsonld/jsonld-frame-command.js';
// import { ShaclCompletionProvider } from './business/autocomplete/shacl-based/shacl-completion-provider.js';
// import { DocumentCache } from './business/autocomplete/shacl-based/document-cache.js';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;


let serverConfigSettings: RDFusionConfigSettings = {
	turtle: { validations: {}, autocomplete: {}, formatting: {} },
	jsonld: { validations: {}, autocomplete: {} },
	common: { validations: {} }
};



const cache = new Cache<string, any>(100);

const dataManager = new DataManager(cache, connection);

const shapeManager = new ShapeManager(connection);

const validationManager = new ValidationManager(dataManager, shapeManager, documents, serverConfigSettings);

const prefixFetcher = new Fetcher();
const prefixRegistry = new PrefixRegistry(prefixFetcher);
const jsonldProvider = new JsonLdPrefixCompletionProvider(prefixRegistry, connection, serverConfigSettings);
const ttlProvider    = new TtlPrefixCompletionProvider(prefixRegistry, connection, serverConfigSettings);

const termProvider   = new TermProvider(dataManager, prefixRegistry, serverConfigSettings);

termProvider.init();



const groupCommand   = new GroupBySubjectCommand(
	dataManager, connection, documents
);

const sortCommand   = new SortTriplesCommand(
	dataManager, connection, documents
);

const filterCommand = new FilterTriplesCommand(dataManager, connection);

const voidGenerator = new VoIDGenerateCommand(dataManager, connection);

const mergeGroupCommand = new MergeGroupCommand(dataManager, connection);

const ttlTermProvider    = new TtlTermCompletionProvider(termProvider, connection, serverConfigSettings);
const jsonldTermProvider = new JsonLdTermCompletionProvider(termProvider, prefixRegistry, connection, serverConfigSettings);

const turtleFormatterCommand = new TurtleFormatterCommand(dataManager, connection, documents, prefixRegistry, serverConfigSettings);
const jsonldFrameCommand = new JsonldFrameCommand(dataManager, connection, documents);

const initialShapes  = shapeManager.getGlobalShapes();
const shaclRegistry = new ShaclRegistry(initialShapes);
//const docCache  = new DocumentCache();
//const shaclProvider = new ShaclCompletionProvider(dataManager, docCache, shaclRegistry, connection);


const diagnosticCache = new Map<string, { version: number; items: Diagnostic[] }>();



connection.onInitialize((params: InitializeParams) => {
	// // console.log('SERVER: onInitialize acessed ....');
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: [':', '"', '@']
			},
			diagnosticProvider: {
				documentSelector: [
					{ scheme: 'file', language: 'turtle' },
					{ scheme: 'file', language: 'jsonld' }
				],
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			inlineCompletionProvider: true,
			executeCommandProvider: {
				commands: [
					'rdf.groupBySubject',
					'rdf.filterTriples',
					'rdf.filterTriplesBySubject',
					'rdf.filterTriplesByPredicate',
					'rdf.filterTriplesByObject',
					'rdf.sortTriples',
					'rdf.generateVoID',
					'rdf.mergeFiles',
					'rdf.frameJsonld',
					'rdf.formatTriples'
				]
			},
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	
	// // console.dir(params.initializationOptions);
	const initOpts = (params.initializationOptions as any)?.rdfusion as RDFusionConfigSettings;

	if (initOpts) {
		serverConfigSettings = initOpts;
		// // console.log(`Initial settings: ${JSON.stringify(serverConfigSettings)}`);
	}

	validationManager.updateSettings(serverConfigSettings);
	termProvider.updateSettings(serverConfigSettings);
	ttlProvider.updateSettings(serverConfigSettings);
	turtleFormatterCommand.updateSettings(serverConfigSettings);

	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}

	connection.client.register(DidChangeConfigurationNotification.type, undefined);
});


connection.onDidChangeConfiguration(change => {
	const updatedConfigSettings = (change.settings as any)?.rdfusion as RDFusionConfigSettings;
	if(updatedConfigSettings) {
		serverConfigSettings = updatedConfigSettings;
	}

	validationManager.updateSettings(serverConfigSettings);
	termProvider.updateSettings(serverConfigSettings);
	ttlProvider.updateSettings(serverConfigSettings);
	turtleFormatterCommand.updateSettings(serverConfigSettings);
	// documents.all().forEach(doc =>
	// 	validationManager.validate(doc.uri)
	// 		.then(diags => connection.sendDiagnostics({ uri: doc.uri, diagnostics: diags }))
	// );

	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});



connection.onNotification('workspace/parsedRdf', async (params: { uri: string; text: string; version: number }) => {
	try {
		const parsedGraph = await dataManager.parseDocument(params.uri, params.text, params.version);
		shapeManager.updateShapeIndex(params.uri, parsedGraph);
		shaclRegistry.update(shapeManager.getGlobalShapes());
		 
		// const diagnostics: Diagnostic[] = await validationManager.validate(params.uri);
		// connection.sendDiagnostics({ uri: params.uri, diagnostics });
		// console.log(`[Server] Processed workspace file ${params.uri}`);
	} catch (error: any) {
		console.error(`[Server] Error processing ${params.uri}: ${error.message}`);
	}
});


shapeManager.refreshGlobalIndex(dataManager);


documents.onDidOpen((event) => {
	dataManager.parseDocument(event.document.uri, event.document.getText(), event.document.version)
    .then((parsedGraph: any) => {
		shapeManager.updateShapeIndex(event.document.uri, parsedGraph);
		//docCache.update(event.document.uri, event.document.getText(), parsedGraph);
		// validationManager.validate(event.document.uri).then((_diagnostics: any) => {
		// 	// connection.sendDiagnostics({ uri: event.document.uri, diagnostics });
		// });
    })
    .catch((err: { message: any; }) => connection.console.error(`Error parsing ${event.document.uri}: ${err.message}`));
});

documents.onDidChangeContent((change) => {
	dataManager.parseDocument(change.document.uri, change.document.getText(), change.document.version)
		.then((parsedGraph: any) => {
			shapeManager.updateShapeIndex(change.document.uri, parsedGraph);
			//docCache.update(change.document.uri, change.document.getText(), parsedGraph);
		// 	validationManager.validate(change.document.uri).then((_diagnostics: any) => {
		// 	// connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
		// });
    })
    .catch((err: { message: unknown; }) => connection.console.error(`Error updating ${change.document.uri}: ${err.message}`));
});

connection.onCompletion(async (params: CompletionParams) => {
	const doc = documents.get(params.textDocument.uri);
	if (!doc) {
		return [];
	}
	if (doc.languageId === 'turtle') {
		const prefixItems =  ttlProvider.provide(params, documents);
		const termItems   =  ttlTermProvider.provide(params, documents);
		// console.log(typeof prefixItems + typeof termItems);
		return [...await prefixItems, ...await termItems];
	} 
	if (doc.languageId === 'jsonld') {
		const prefixItemsJ =  jsonldProvider.provide(params, documents);
		const termItemsJ   =  jsonldTermProvider.provide(params, documents);
		return [...await prefixItemsJ, ...await termItemsJ];
	}
	return [];
});



// connection.onRequest('textDocument/inlineCompletion', async (params: TextDocumentPositionParams) => {
// 	const doc = documents.get(params.textDocument.uri);
// 	// console.log(`[suggestions] ${JSON.stringify("INSIDE")}`);
// 	if (!doc) {
// 		return [];
// 	}
// 	if (doc.languageId === 'turtle') {
// 		const inlineItems = await shaclProvider.provide(params, documents);
// 		// console.dir(`[suggestions] ${JSON.stringify(inlineItems)}`);
// 		return inlineItems;
// 	}
// 	// console.dir(`[suggestions] ${JSON.stringify("nothing")}`);
// 	return [];
// });


connection.onExecuteCommand(async (params) => {
	if (params.command === 'rdf.groupBySubject' && params.arguments) {
		await groupCommand.execute(params.arguments[0] as { uri: string });
	}
	else if (params.command === 'rdf.filterTriples') {
		return filterCommand.execute(params?.arguments?.[0] as {
			uri: string;
			subjectFilters:   string[];
			predicateFilters: string[];
			objectFilters:    string[];
		});
	}
	else if (params.command === 'rdf.filterTriplesBySubject') {
		return filterCommand.execute(params?.arguments?.[0] as {
			uri: string;
			subjectFilters?:   string[];
			predicateFilters?: string[];
			objectFilters?:    string[];
		});
	}
	else if (params.command === 'rdf.filterTriplesByPredicate') {
		return filterCommand.execute(params?.arguments?.[0] as {
			uri: string;
			subjectFilters?:   string[];
			predicateFilters?: string[];
			objectFilters?:    string[];
		});
	}	
	else if (params.command === 'rdf.filterTriplesByObject') {
		return filterCommand.execute(params?.arguments?.[0] as {
			uri: string;
			subjectFilters?:   string[];
			predicateFilters?: string[];
			objectFilters?:    string[];
		});
	}
	else if (params.command === 'rdf.sortTriples' && params.arguments) {
		await sortCommand.execute(params.arguments[0] as { uri: string; mode: string; direction: string });
	}
	else if (params.command === 'rdf.generateVoID' && params.arguments) {
		const generatedVoID = await voidGenerator.execute(params.arguments[0] as { uri: string });
		return generatedVoID;
	}
	else if (params.command === 'rdf.mergeFiles' && params.arguments) {
		const args = params.arguments[0] as MergeParams;
		return mergeGroupCommand.execute(args);
	}
	else if (params.command === 'rdf.frameJsonld' && params.arguments) {
		await jsonldFrameCommand.execute(params.arguments[0] as { uri: string, data: string });
	}
	else if (params.command === 'rdf.formatTriples' && params.arguments) {
		await turtleFormatterCommand.format(params.arguments[0] as { uri: string });
	}
});


connection.onRequest('textDocument/diagnostic',	async (params: DocumentDiagnosticParams): Promise<DocumentDiagnosticReport> => {
		const uri = params.textDocument.uri;
		const doc = documents.get(uri);
		if (!doc) {
			return { kind: 'full', items: [] };
		}

		const cached = diagnosticCache.get(uri);
		if (cached && cached.version === doc.version) {
			return {
				kind: 'full',
				items: cached.items,
				resultId: String(cached.version)
			};
		}

		const diagnostics = await validationManager.validate(uri);
		diagnosticCache.set(uri, { version: doc.version, items: diagnostics });
		return {
			kind: "full", 
			items: diagnostics,
			resultId: String(doc.version)
		};
	}
);


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

