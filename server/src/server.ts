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
	CodeActionKind,
	CodeAction,
	CodeActionParams
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
import { ShaclRegistry } from './business/autocomplete/shacl-based/shacl-registry.js';
import { RDFusionConfigSettings } from './utils/irdfusion-config-settings.js';
import { GroupBySubjectCommand } from './business/triple-management/grouping/group-by-subject-command.js';
import { FilterTriplesCommand } from './business/triple-management/filtering/filter-triples-command.js';
import { VoIDGenerateCommand } from './business/triple-management/void-generate/void-generate-command.js';
import { MergeGroupCommand, MergeParams } from './business/triple-management/merge-files/merge-and-group-command.js';
import { SortTriplesCommand } from './business/triple-management/sorting/sorting-triples-command.js';
import { TurtleFormatterCommand } from './business/triple-management/formatting/turtle/turtle-formatter-command.js';
import { JsonldFrameCommand } from './business/triple-management/formatting/jsonld/jsonld-frame-command.js';
import { RdfDiffService } from './business/triple-management/rdf-diff/ttl-diff-command.js';
import { JsonLdRefactorProvider } from './business/autocomplete/prefix/jsonld/jsonld-prefix-refactor.js';
import { JsonLdRenameProvider } from './business/autocomplete/prefix/jsonld/jsonld-rename-provider.js';
import { JsonLdDifferentModesCommand } from './business/triple-management/formatting/jsonld/jsonld-formatting-command.js';
import { UnicodeEscapesCommand } from './business/triple-management/unicode-escape/unicode-escapes-command.js';

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

const ttlDiff   = new RdfDiffService(
	connection, documents
);

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
const jsonldFormattingCommand = new JsonLdDifferentModesCommand(dataManager, connection, documents, prefixRegistry);

const unicodeEscapeTransformCommand = new UnicodeEscapesCommand(
	connection, documents
);


const initialShapes  = shapeManager.getGlobalShapes();
const shaclRegistry = new ShaclRegistry(initialShapes);
const diagnosticCache = new Map<string, { version: number; items: Diagnostic[] }>();

const refactor = new JsonLdRefactorProvider(connection, dataManager, documents, prefixRegistry);
const rename = new JsonLdRenameProvider(connection, dataManager, documents);

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
			renameProvider: { prepareProvider: true },
			completionProvider: {
				resolveProvider: false,
				triggerCharacters: [':', '"', '@']
			},
			executeCommandProvider: {
				commands: [
					'jsonld.applyPrefixServer',
					'rdf.groupBySubject',
					'rdf.filterTriples',
					'rdf.filterTriplesBySubject',
					'rdf.filterTriplesByPredicate',
					'rdf.filterTriplesByObject',
					'rdf.sortTriples',
					'rdf.generateVoID',
					'rdf.mergeFiles',
					'rdf.frameJsonld',
					'rdf.formatTriples',
					'rdf.compactJsonld',
					'rdf.expandJsonld',
					'rdf.flattenJsonld',
					'rdf.turtleUnicodeEscapeTransform',
				]
			},
			diagnosticProvider: {
				documentSelector: [
					{ scheme: 'file', language: 'turtle' },
					{ scheme: 'file', language: 'jsonld' }
				],
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			codeActionProvider: {
				codeActionKinds: [CodeActionKind.Refactor],
				resolveProvider: false,
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
	connection.languages.diagnostics.refresh();
});



connection.onNotification('workspace/parsedRdf', async (params: { uri: string; text: string; version: number }) => {
	try {
		const parsedGraph = await dataManager.parseDocument(params.uri, params.text, params.version);
		shapeManager.updateShapeIndex(params.uri, parsedGraph);
		shaclRegistry.update(shapeManager.getGlobalShapes());
	} catch (error: any) {
		console.error(`[Server] Error processing ${params.uri}: ${error.message}`);
	}
});


shapeManager.refreshGlobalIndex(dataManager);


documents.onDidOpen((event) => {
	dataManager.parseDocument(event.document.uri, event.document.getText(), event.document.version)
    .then((parsedGraph: any) => {
		shapeManager.updateShapeIndex(event.document.uri, parsedGraph);
    })
    .catch((err: { message: any; }) => connection.console.error(`Error parsing ${event.document.uri}: ${err.message}`));
});

documents.onDidChangeContent((change) => {
	dataManager.parseDocument(change.document.uri, change.document.getText(), change.document.version)
		.then((parsedGraph: any) => {
			shapeManager.updateShapeIndex(change.document.uri, parsedGraph);
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

interface UriArg {
	uri: string;
}

interface FilterArgs {
	uri: string;
	subjectFilters?: string[];
	predicateFilters?: string[];
	objectFilters?: string[];
}

interface SortArgs {
	uri: string;
	mode: string; 
	direction: string; 
}

interface FrameArgs {
	uri: string;
	data: string; 
}

interface UnicodeEscapeTargetsArg {
	uri: string;
	mode: string; 
}

type ExecHandler = (args: any[] | undefined) => Promise<any> | any;

const execHandlers = new Map<string, ExecHandler>();

function registerExec(id: string, handler: ExecHandler) {
	if (execHandlers.has(id)) {
		connection.console.warn(`executeCommand handler overwritten: ${id}`);
	}
	execHandlers.set(id, handler);
}

function arg0<T extends object>(args: any[] | undefined, required: (keyof T)[] = []): T {
	const payload = (args?.[0] ?? {}) as T;
	for (const k of required) {
		if ((payload as any)[k] === undefined) {
		throw new Error(`Missing required argument "${String(k)}" for executeCommand`);
		}
	}
	return payload;
}

registerExec('jsonld.applyPrefixServer', (args) =>
	refactor.handleApplyPrefixServer(args)
);

registerExec('rdf.groupBySubject', async (args) => {
	const p = arg0<UriArg>(args, ['uri']);
	return groupCommand.execute(p);
});

registerExec('rdf.filterTriples', async (args) => {
	const p = arg0<FilterArgs>(args, ['uri']);
	return filterCommand.execute(p);
});

registerExec('rdf.filterTriplesBySubject', async (args) => {
	const p = arg0<FilterArgs>(args, ['uri']);
	return filterCommand.execute(p);
});

registerExec('rdf.filterTriplesByPredicate', async (args) => {
	const p = arg0<FilterArgs>(args, ['uri']);
	return filterCommand.execute(p);
});

registerExec('rdf.filterTriplesByObject', async (args) => {
	const p = arg0<FilterArgs>(args, ['uri']);
	return filterCommand.execute(p);
});

registerExec('rdf.sortTriples', async (args) => {
	const p = arg0<SortArgs>(args, ['uri', 'mode', 'direction']);
	return sortCommand.execute(p);
});

registerExec('rdf.generateVoID', async (args) => {
	const p = arg0<UriArg>(args, ['uri']);
	return voidGenerator.execute(p);
});

registerExec('rdf.mergeFiles', async (args) => {
	const p = arg0<MergeParams>(args);
	return mergeGroupCommand.execute(p);
});

registerExec('rdf.frameJsonld', async (args) => {
	const p = arg0<FrameArgs>(args, ['uri', 'data']);
	return jsonldFrameCommand.execute(p);
});

registerExec('rdf.compactJsonld', async (args) => {
	const p = arg0<SortArgs>(args, ['uri', 'mode']);
	return jsonldFormattingCommand.execute(p);
});

registerExec('rdf.expandJsonld', async (args) => {
	const p = arg0<SortArgs>(args, ['uri', 'mode']);
	return jsonldFormattingCommand.execute(p);
});

registerExec('rdf.flattenJsonld', async (args) => {
	const p = arg0<SortArgs>(args, ['uri', 'mode']);
	return jsonldFormattingCommand.execute(p);
});

registerExec('rdf.formatTriples', async (args) => {
	const p = arg0<UriArg>(args, ['uri']);
	connection.console.log('onExecuteCommand: rdf.formatTriples');
	return turtleFormatterCommand.format(p);
});

registerExec('rdf.turtleUnicodeEscapeTransform', async (args) => {
	const p = arg0<UnicodeEscapeTargetsArg>(args, ['uri', 'mode']);
	return unicodeEscapeTransformCommand.execute(p);
});

connection.onExecuteCommand(async (params) => {
	connection.console.log('onExecuteCommand: ' + JSON.stringify(params));

	const handler = execHandlers.get(params.command);
	if (!handler) {
		connection.console.warn(`Unknown executeCommand: ${params.command}`);
		return;
	}

	try {
		return await handler(params.arguments);
	} catch (err: any) {
		connection.console.error(
			`executeCommand ${params.command} failed: ${err?.stack || err?.message || String(err)}`
		);
		throw err; 
	}
});

const codeActionProviders: ((p: CodeActionParams) => CodeAction[] | Promise<CodeAction[]>)[] = [
	refactor.provideCodeActions,
];

connection.onCodeAction(async (params: CodeActionParams): Promise<CodeAction[]> => {
	const lists = await Promise.all(
		codeActionProviders.map((fn) => Promise.resolve(fn(params)))
	);
	return lists.flat().filter(Boolean) as CodeAction[];
});

connection.onPrepareRename((params) => {
	return rename.prepareRename(params);
});

connection.onRenameRequest((params) => {
	return rename.rename(params);
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




ttlDiff.register();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

