/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { workspace, ExtensionContext, Uri } from 'vscode';

import {
	DidChangeConfigurationNotification,
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

import { FileTreeProvider, watchFiles } from './presentation/activity-bar/file-tree-provider';
import { WorkspaceScanCallback, WorkspaceScanner } from './data/workspace-scanner';
import { sendParsedRdfNotification } from './utils/workspace-notifier';
import { 
	defaultJsonLdAutocomplete, 
	defaultJsonLdValidations, 
	defaultTurtleAutocomplete, 
	defaultTurtleValidations, 
	jsonLdAutocompleteLabels, 
	jsonLdValidationLabels, 
	turtleAutocompleteLabels, 
	turtleValidationLabels
} from './default-config/default-config';
import { DecorationManager } from './presentation/decoration/decoration-manager';
import { IriCodeLensProvider } from './presentation/decoration/iri-codelens-provider';
import { FileItem } from './presentation/activity-bar/file-item';
import { defaultTurtleFormatConfig, turtleFormattingLabels } from './default-config/turtle-formatting-config';
import { defaultIriSchemeConfig, IriSchemeConfigLabels } from './default-config/Iri-scheme-config';
import { StatusBarManager } from './presentation/status-bar/status-bar';

let client: LanguageClient;


class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
	provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken
	): Promise<vscode.InlineCompletionList> {
	  // Forward the request to the LSP server
		return client.sendRequest(
			"textDocument/inlineCompletion",
			{
				textDocument: { uri: document.uri.toString() },
				position: { line: position.line, character: position.character },
				context,
			}
		);
	}
}

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('out', 'server.js')
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc }
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'turtle' }, 
			{ scheme: 'file', language: 'jsonld' }  
		],
		synchronize: {
			configurationSection: 'rdfusion',
			fileEvents: workspace.createFileSystemWatcher('**/.{ttl, jsonld}')
		},
		initializationOptions: {
			rdfusion: {
				turtle: {
					validations: workspace.getConfiguration('rdfusion')
						.get('turtle.validations', defaultTurtleValidations),
					autocomplete: workspace.getConfiguration('rdfusion')
						.get('turtle.autocomplete', defaultTurtleAutocomplete),
					formatting: workspace.getConfiguration('rdfusion')
						.get('turtle.formatting', defaultTurtleFormatConfig)
				},
				jsonld: {
					validations: workspace.getConfiguration('rdfusion')
						.get('jsonld.validations', defaultJsonLdValidations),
					autocomplete: workspace.getConfiguration('rdfusion')
						.get('jsonld.autocomplete', defaultJsonLdAutocomplete)
				},
				common: {
					validations: workspace.getConfiguration('rdfusion')
						.get('common.validations', defaultIriSchemeConfig)
				}
			}
		}
	};

	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	client.start();

	const fileTreeProvider = new FileTreeProvider();

	//vscode.window.registerTreeDataProvider("fileExplorer", fileTreeProvider);

	vscode.window.createTreeView("fileExplorer", {
		treeDataProvider: fileTreeProvider,
		showCollapseAll: true,
		canSelectMany: true,
	});

	watchFiles(fileTreeProvider);

	context.subscriptions.push(
		vscode.commands.registerCommand("rdfusion.openFile", (uri: vscode.Uri) => {
			vscode.window.showTextDocument(uri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("rdfusion.refreshExplorer", () => {
			fileTreeProvider.refresh();
		})
	);

	const config = vscode.workspace.getConfiguration('rdf');
	const workspaceGlob = config.get<string>('vocabularyGlob') || '**/*.{ttl,jsonld}';

	const scanCallback: WorkspaceScanCallback = async (files: vscode.Uri[]) => {
		fileTreeProvider.refresh();
		// // console.log(`[Extension] Workspace scan completed. ${files.length} RDF file(s) found.`);
		await sendParsedRdfNotification(files, client);
	};

	const scanner = new WorkspaceScanner(workspaceGlob, scanCallback, 500);
	scanner.startWatching();
	scanner.performScan();
	context.subscriptions.push(scanner);

	// single status-bar for summary
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	context.subscriptions.push(statusBar);

	function refreshStatus() {
		const config = workspace.getConfiguration('rdfusion');
		const tValid   = config.get<Record<string,boolean>>('turtle.validations', defaultTurtleValidations);
		const jValid   = config.get<Record<string,boolean>>('jsonld.validations', defaultJsonLdValidations);
		const tAuto    = config.get<Record<string,boolean>>('turtle.autocomplete', defaultTurtleAutocomplete);
		const jAuto    = config.get<Record<string,boolean>>('jsonld.autocomplete', defaultJsonLdAutocomplete);
		const tFormat  = config.get<Record<string,boolean|number>>('turtle.formatting', defaultTurtleFormatConfig);
		const iriValid = config.get<Record<string,boolean|string>>('common.validations', defaultIriSchemeConfig);

		const enabledCount =
			Object.values(tValid).filter(v => v).length +
			Object.values(jValid).filter(v => v).length +
			Object.values(tAuto).filter(v => v).length +
			Object.values(jAuto).filter(v => v).length +
			Object.values(iriValid).filter(v => v).length +
			Object.values(tFormat).filter(v => v).length;

		const totalCount =
			Object.keys(defaultTurtleValidations).length +
			Object.keys(defaultJsonLdValidations).length +
			Object.keys(defaultTurtleAutocomplete).length +
			Object.keys(defaultJsonLdAutocomplete).length +
			Object.keys(defaultIriSchemeConfig).length +
			Object.keys(defaultTurtleFormatConfig).length;

		statusBar.text = `$(checklist) ${enabledCount}/${totalCount} switches ON`;
		statusBar.tooltip = 'Pick any of the RDFusion toggle commands to reconfigure';
		statusBar.show();
	}

	async function configureSection<K extends string>(
		configKey: string,
		defaults: Record<K, boolean | number | string>,
		labelMap: Record<K, string>,
		sectionName: string
	) {
		const config = workspace.getConfiguration('rdfusion');
		const current = config.get<Record<string, boolean | number | string>>(configKey, defaults);

		const items = (Object.keys(defaults) as K[]).map(key => ({
			key,
			label: labelMap[key],
			picked: !!current[key] 
		}));

		const picked = await vscode.window.showQuickPick(items, {
			canPickMany: true,
			placeHolder: `Select which ${sectionName} to enable/configure`
		});

		if (!picked) return;

		const updated: Record<string, boolean | number | string> = {};

		for (const k of Object.keys(defaults) as K[]) {
			const isSelected = picked.some(p => p.key === k);
			const defaultValue = defaults[k];
		
			if (typeof defaultValue === 'boolean') {
				updated[k] = isSelected;
			} else if (typeof defaultValue === 'number') {
				if (isSelected) {
					const input = await vscode.window.showInputBox({
						prompt: `Enter value for ${labelMap[k]} (number)`,
						value: current[k]?.toString() ?? defaultValue.toString(),
						validateInput: (val) =>
						isNaN(Number(val)) ? 'Must be a valid number' : undefined
					});
			
					if (input !== undefined) {
						updated[k] = Number(input);
					} else {
						updated[k] = defaultValue;
					}
				} else {
					updated[k] = 0;
				}
			} else if (typeof defaultValue === 'string') {
				if (isSelected) {
					const input = await vscode.window.showInputBox({
						prompt: `Enter value for ${labelMap[k]} (comma separated)`,
						value: current[k]?.toString() ?? defaultValue.toString()				
					});
			
					if (input !== undefined) {
						updated[k] = input;
					} else {
						updated[k] = defaultValue;
					}
				} else {
					updated[k] = 0;
				}
			}
		}
	
		await config.update(configKey, updated, vscode.ConfigurationTarget.Global);

		vscode.window.showInformationMessage(`Updated ${sectionName}`);
		refreshStatus();
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'rdfusion.configureTurtleValidations',
			() => configureSection('turtle.validations', defaultTurtleValidations, turtleValidationLabels, 'Turtle Validations')
		),
		vscode.commands.registerCommand(
			'rdfusion.configureTurtleAutocomplete',
			() => configureSection('turtle.autocomplete', defaultTurtleAutocomplete, turtleAutocompleteLabels, 'Autocomplete')
		),
		vscode.commands.registerCommand(
			'rdfusion.configureJsonldValidations',
			() => configureSection('jsonld.validations', defaultJsonLdValidations, jsonLdValidationLabels, 'JSON-LD Validations')
		),
		vscode.commands.registerCommand(
			'rdfusion.configureJsonldAutocomplete',
			() => configureSection('jsonld.autocomplete', defaultJsonLdAutocomplete, jsonLdAutocompleteLabels, 'JSON-LD Autocomplete')
		),
		vscode.commands.registerCommand(
			'rdfusion.configureTurtleFormatting',
			() => configureSection('turtle.formatting', defaultTurtleFormatConfig, turtleFormattingLabels, 'Turtle Formatting')
		),
		vscode.commands.registerCommand(
			'rdfusion.configureIriSchemeValidation',
			() => configureSection('common.validations', defaultIriSchemeConfig, IriSchemeConfigLabels, 'IRI Scheme Config')
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.groupBySubject', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.groupBySubject',
				arguments: [{ uri }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.sortBySubjectAsc', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			const mode = "subject";
			const direction = "asc";
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.sortTriples',
				arguments: [{ uri, mode, direction }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.sortBySubjectDesc', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			const mode = "subject";
			const direction = "desc";
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.sortTriples',
				arguments: [{ uri, mode, direction }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.sortByPredicateAsc', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			const mode = "predicate";
			const direction = "asc";
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.sortTriples',
				arguments: [{ uri, mode, direction }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.sortByPredicateDesc', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			const mode = "predicate";
			const direction = "desc";
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.sortTriples',
				arguments: [{ uri, mode, direction }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.formatTriples', () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			client.sendRequest('workspace/executeCommand', {
				command: 'rdf.formatTriples',
				arguments: [{ uri }]
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.generateVoID', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
			const generatedVoID: string = await client.sendRequest('workspace/executeCommand', {
				command: 'rdf.generateVoID',
				arguments: [{ uri }]
			});

			const doc = await vscode.workspace.openTextDocument({
				language: 'turtle',
				content: generatedVoID
			});

			vscode.window.showTextDocument(doc, { preview: false });
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.filterTriples', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
		
			const ask = (label: string) =>
				vscode.window.showInputBox({ prompt: label, placeHolder: 'e.g. ex:Bart, foaf:name, "Simpson"' });
		
			const subj = await ask('Enter one or more subjects (comma-separated):');
			const pred = await ask('Enter one or more predicates (comma-separated):');
			const obj  = await ask('Enter one or more objects (comma-separated):');
		
			const parseList = (userInput?: string) =>
				userInput
				? userInput.split(',')
					.map(s => s.trim())
					.filter(s => s.length > 0)
				: [];
		
			const subjectFilters   = parseList(subj);
			const predicateFilters = parseList(pred);
			const objectFilters    = parseList(obj);
		
			const filteredText: string = await client.sendRequest(
				'workspace/executeCommand',
				{
				command: 'rdf.filterTriples',
				arguments: [{
					uri,
					subjectFilters,
					predicateFilters,
					objectFilters
				}]
				}
			);
			
			const langId = editor.document.languageId;

			const doc = await vscode.workspace.openTextDocument({
				language: langId,
				content: filteredText
			});
			vscode.window.showTextDocument(doc, { preview: false });
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.filterTriplesBySubject', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
		
			const ask = (label: string) =>
				vscode.window.showInputBox({ prompt: label, placeHolder: 'e.g. ex:Bart, <http://example.org/lisa>, ex:Person' });
		
			const subj = await ask('Enter one or more subjects (comma-separated):');
		
			const parseList = (userInput?: string) =>
				userInput
				? userInput.split(',')
					.map(s => s.trim())
					.filter(s => s.length > 0)
				: [];
		
			const subjectFilters   = parseList(subj);
		
			const filteredText: string = await client.sendRequest(
				'workspace/executeCommand',
				{
				command: 'rdf.filterTriplesBySubject',
				arguments: [{
					uri,
					subjectFilters
				}]
				}
			);
			const langId = editor.document.languageId;

			const doc = await vscode.workspace.openTextDocument({
				language: langId,
				content: filteredText
			});
			vscode.window.showTextDocument(doc, { preview: false });
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.filterTriplesByPredicate', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
		
			const ask = (label: string) =>
				vscode.window.showInputBox({ prompt: label, placeHolder: 'e.g. foaf:mbox, ex:knows, <http://xmlns.com/foaf/0.1/name>' });
		
			const pred = await ask('Enter one or more predicates (comma-separated):');
		
			const parseList = (userInput?: string) =>
				userInput
				? userInput.split(',')
					.map(s => s.trim())
					.filter(s => s.length > 0)
				: [];
		
			const predicateFilters = parseList(pred);
		
			const filteredText: string = await client.sendRequest(
				'workspace/executeCommand',
				{
				command: 'rdf.filterTriplesByPredicate',
				arguments: [{
					uri,
					predicateFilters
				}]
				}
			);

			const langId = editor.document.languageId;

			const doc = await vscode.workspace.openTextDocument({
				language: langId,
				content: filteredText
			});
			vscode.window.showTextDocument(doc, { preview: false });
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.filterTriplesByObject', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();
		
			const ask = (label: string) =>
				vscode.window.showInputBox({ prompt: label, placeHolder: 'e.g. 20, "Simpson", <mailto:bart@example.com>' });
		
			const obj  = await ask('Enter one or more objects (comma-separated):');
		
			const parseList = (userInput?: string) =>
				userInput
				? userInput.split(',')
					.map(s => s.trim())
					.filter(s => s.length > 0)
				: [];
		
			const objectFilters    = parseList(obj);
		
			const filteredText: string = await client.sendRequest(
				'workspace/executeCommand',
				{
				command: 'rdf.filterTriplesByObject',
				arguments: [{
					uri,
					objectFilters
				}]
				}
			);
			
			const langId = editor.document.languageId;

			const doc = await vscode.workspace.openTextDocument({
				language: langId,
				content: filteredText
			});
			vscode.window.showTextDocument(doc, { preview: false });
		})
	);

	const decoMgr = new DecorationManager();
	const lensProv = new IriCodeLensProvider(decoMgr);

	const toggleIriShorten = vscode.commands.registerCommand(
		'rdfusion.toggleIriShorten',
		async () => {
			const config = vscode.workspace.getConfiguration('rdfusion.turtle.irishorten');
			const current = config.get<boolean>('enabled', false);
			const updated = !current;
		
			try {
				await config.update('enabled', updated, vscode.ConfigurationTarget.Global);
			} catch (err: any) {
				return vscode.window.showErrorMessage(
				`Could not update IRI shortening setting: ${err.message}`
				);
			}
		
			vscode.window.showInformationMessage(
				`Turtle IRI shortening ${updated ? 'enabled' : 'disabled'}`
			);
		}
	);
	context.subscriptions.push(toggleIriShorten);
	
	const setIriMaxLength = vscode.commands.registerCommand(
		'rdfusion.setIriMaxLength',
		async () => {
			const config = vscode.workspace.getConfiguration('rdfusion.turtle.irishorten');
			const current = config.get<number>('maxLength', 30);
		
			const input = await vscode.window.showInputBox({
				prompt: 'Enter the maximum IRI length',
				value: String(current),
				validateInput: v =>
				isNaN(Number(v)) || Number(v) < 15
					? 'Number must be at least 15'
					: null
			});
			if (input === undefined) {
				return;
			}
		
			const newValue = Number(input);
		
			try {
				await config.update('maxLength', newValue, vscode.ConfigurationTarget.Global);
			
			} catch (e: any) {
				return vscode.window.showErrorMessage(
					`Failed to write settings: ${e.message}`
				);
			}
		
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				decoMgr.update(editor);
				lensProv.refresh();
			}
		
			vscode.window.showInformationMessage(
				`IRI max length set to ${newValue}.`
			);
		}
	);
	context.subscriptions.push(setIriMaxLength);

	const toggleOneIri = vscode.commands.registerCommand(
		'rdfusion.toggleOneIri',
		(uri: vscode.Uri, key: string) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				return vscode.window.showErrorMessage('Open a Turtle document first.');
			}
			decoMgr.toggle(key);
			decoMgr.update(editor);
			lensProv.refresh();
		}
	);
	context.subscriptions.push(toggleOneIri);

	context.subscriptions.push(
		vscode.commands.registerCommand('rdfusion.frameJsonld', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				vscode.window.showErrorMessage('Open an RDF document first.');
				return;
			}
			const uri = editor.document.uri.toString();

			const frameFs = await vscode.window.showOpenDialog({
				canSelectMany: false,
				openLabel: 'Select a JSON-LD frame template (optional)',
				filters: { 'JSON-LD Files': ['jsonld', 'json'] }
			});

			if(!frameFs) {return;}

			const bytes = await vscode.workspace.fs.readFile(frameFs[0]);
			const data = new TextDecoder("utf8").decode(bytes);

			try {
				client.sendRequest('workspace/executeCommand', {
					command: 'rdf.frameJsonld',
					arguments: [{ uri: uri, data }]
				});
			} catch (e: any) {
				vscode.window.showErrorMessage(`JSONLD frame failed: ${e.message}`);
			}
		})
	);


	context.subscriptions.push(
		vscode.commands.registerCommand("rdfusion.mergeFiles",
			async (
				item: FileItem | vscode.Uri | undefined,
				items: (FileItem | vscode.Uri)[] | undefined
			) => {
				let filesToMerge: vscode.Uri[] = [];
		
				if (Array.isArray(items) && items.length > 0) {
					filesToMerge = items.map((x) => {
						if (x instanceof FileItem) {
							return x.resourceUri;
						} else {
							return x; 
						}
					});
				} else if (item instanceof FileItem) {
					filesToMerge = [item.resourceUri];
				} else if (item instanceof vscode.Uri) {
					filesToMerge = [item];
				} else {
					const picked = await vscode.window.showOpenDialog({
						canSelectMany: true,
						openLabel: "Select RDF files to merge",
						filters: { "RDF Files": ["ttl", "jsonld"] },
					});

					if (!picked || picked.length === 0) {
						return; 
					}

					filesToMerge = picked;
				}
		
				if (filesToMerge.length === 1) {
					const choice = await vscode.window.showInformationMessage(
						"Only one RDF file is selected. What would you like to do?",
						"Pick more files to merge",
						"Cancel"
					);

					if (choice === "Pick more files to merge") {
						const more = await vscode.window.showOpenDialog({
							canSelectMany: true,
							openLabel: "Pick one or more additional RDF files to merge",
							filters: { "RDF Files": ["ttl", "jsonld"] },
						});
						if (!more || more.length === 0) {
							return;
						}
						for (const u of more) {
							if (!filesToMerge.find((f) => f.toString() === u.toString())) {
								filesToMerge.push(u);
							}
						}
					} else {
						return;
					}
				}
		
				const mergeParamsFiles: { uri: string; text: string; version: number }[] = [];
				for (const fileUri of filesToMerge) {
					try {
						const bytes = await vscode.workspace.fs.readFile(fileUri);
						const text = new TextDecoder("utf8").decode(bytes);
						mergeParamsFiles.push({
							uri: fileUri.toString(),
							text,
							version: 0,
						});
					} catch (err) {
						vscode.window.showErrorMessage(
							`Cannot read ${fileUri.fsPath}: ${(err as any).message}`
						);
						return;
					}
				}
		
				let mergedTurtle: string;
				try {
					mergedTurtle = await client.sendRequest("workspace/executeCommand", {
						command: "rdf.mergeFiles",
						arguments: [{ files: mergeParamsFiles }],
					});
				} catch (err) {
					vscode.window.showErrorMessage(`Merge failed: ${(err as any).message}`);
					return;
				}
		
				if (mergedTurtle && mergedTurtle.trim().length > 0) {
					const doc = await vscode.workspace.openTextDocument({
						content: mergedTurtle,
						language: "turtle",
					});
					await vscode.window.showTextDocument(doc, { preview: false });
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {decoMgr.update(editor);}
		}),
		vscode.workspace.onDidChangeTextDocument(e => {
			const editor = vscode.window.activeTextEditor;
			if (editor && e.document === editor.document) {decoMgr.update(editor);}
		}),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('rdfusion.turtle.irishorten')) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {decoMgr.update(editor);}
			}
		}),
		vscode.languages.registerCodeLensProvider(
			{ scheme: 'file', language: 'turtle' },
			lensProv
		),
		decoMgr,
	);

	if (vscode.window.activeTextEditor) {
		decoMgr.update(vscode.window.activeTextEditor);
	}

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {decoMgr.update(editor);}
			}),
			vscode.workspace.onDidChangeTextDocument(e => {
			const editor = vscode.window.activeTextEditor;
			if (editor && e.document === editor.document) {decoMgr.update(editor);}
			}),
			vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('rdfusion.turtle.irishorten')) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {decoMgr.update(editor);}
			}
		})
	);


	// const inlineCompletionProvider = new InlineCompletionProvider();
	// vscode.languages.registerInlineCompletionItemProvider(
	//   { scheme: 'file', language: 'turtle' },
	//   inlineCompletionProvider
	// );

	vscode.languages.registerInlineCompletionItemProvider(
		{ scheme: 'file' },
		new InlineCompletionProvider()
	);
	
	StatusBarManager.register(context);

	refreshStatus();

	client.onNotification('window/logMessage', (params) => {
		const message = `${params.message}`;
		switch(params.type) {
			case 1: 
				vscode.window.showErrorMessage(message);
				break;
			case 2:
				vscode.window.showWarningMessage(message);
				break;
			case 3: 
				vscode.window.showInformationMessage(message);
				break;
			default:
				console.log('LogMessage:', message);
		}
	});
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
