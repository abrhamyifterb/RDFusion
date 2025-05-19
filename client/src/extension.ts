/* eslint-disable @typescript-eslint/no-unused-vars */
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

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
			fileEvents: workspace.createFileSystemWatcher('**/.{ttl, jsonld}')
		},
		initializationOptions: {
			rdfusion: {
				turtle: {
					validations: workspace.getConfiguration('rdfusion')
						.get('turtle.validations', defaultTurtleValidations),
					autocomplete: workspace.getConfiguration('rdfusion')
						.get('turtle.autocomplete', defaultTurtleAutocomplete)
				},
				jsonld: {
					validations: workspace.getConfiguration('rdfusion')
						.get('jsonld.validations', defaultJsonLdValidations),
					autocomplete: workspace.getConfiguration('rdfusion')
						.get('jsonld.autocomplete', defaultJsonLdAutocomplete)
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

	vscode.window.registerTreeDataProvider("fileExplorer", fileTreeProvider);

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
		const cfg = workspace.getConfiguration('rdfusion');
		const tValid   = cfg.get<Record<string,boolean>>('turtle.validations', defaultTurtleValidations);
		const jValid   = cfg.get<Record<string,boolean>>('jsonld.validations', defaultJsonLdValidations);
		const tAuto    = cfg.get<Record<string,boolean>>('turtle.autocomplete', defaultTurtleAutocomplete);
		const jAuto    = cfg.get<Record<string,boolean>>('jsonld.autocomplete', defaultJsonLdAutocomplete);

		const enabledCount =
		Object.values(tValid).filter(v => v).length +
		Object.values(jValid).filter(v => v).length +
		Object.values(tAuto).filter(v => v).length +
		Object.values(jAuto).filter(v => v).length;

		const totalCount =
		Object.keys(defaultTurtleValidations).length +
		Object.keys(defaultJsonLdValidations).length +
		Object.keys(defaultTurtleAutocomplete).length +
		Object.keys(defaultJsonLdAutocomplete).length;

		statusBar.text = `$(checklist) ${enabledCount}/${totalCount} switches ON`;
		statusBar.tooltip = 'Pick any of the RDFusion toggle commands to reconfigure';
		statusBar.show();
	}

	async function configureSection<K extends string>(
		configKey: string,
		defaults: Record<K, boolean>,
		labelMap: Record<K, string>,
		sectionName: string
	) {
		const cfg = workspace.getConfiguration('rdfusion');
		const current = cfg.get<Record<string,boolean>>(configKey, defaults);

		const items = (Object.keys(defaults) as K[]).map(key => ({
			key,
			label: labelMap[key],
			picked: !!current[key]
		})) as {
			key: K;
			label: string;
			picked: boolean;
		}[];

		const picked = await vscode.window.showQuickPick(items, {
			canPickMany: true,
			placeHolder: `Select which ${sectionName} to enable`
		});

		if (!picked) {
			return;
		}

		const updated: Record<string,boolean> = {};
		for (const k of Object.keys(defaults) as K[]) {
			updated[k] = picked.some(item => item.key === k);
		}

		await cfg.update(configKey, updated, vscode.ConfigurationTarget.Workspace);

		client.sendNotification(DidChangeConfigurationNotification.type, {
			settings: {
				rdfusion: {
					turtle: {
						validations: workspace
							.getConfiguration('rdfusion')
							.get('turtle.validations', defaultTurtleValidations),
						autocomplete: workspace
							.getConfiguration('rdfusion')
							.get('turtle.autocomplete', defaultTurtleAutocomplete)
					},
					jsonld: {
						validations: workspace
							.getConfiguration('rdfusion')
							.get('jsonld.validations', defaultJsonLdValidations),
						autocomplete: workspace
							.getConfiguration('rdfusion')
							.get('jsonld.autocomplete', defaultJsonLdAutocomplete)
					}
				}
			}
		});

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
		)
	);

	context.subscriptions.push(
		workspace.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration('rdfusion.turtle.validations')     ||
				e.affectsConfiguration('rdfusion.turtle.autocomplete')    ||
				e.affectsConfiguration('rdfusion.jsonld.validations')     ||
				e.affectsConfiguration('rdfusion.jsonld.autocomplete')
			) {
				client.sendNotification(DidChangeConfigurationNotification.type, {
					settings: {
						rdfusion: {
							turtle: {
								validations: workspace
									.getConfiguration('rdfusion')
									.get('turtle.validations', defaultTurtleValidations),
								
								autocomplete: workspace
									.getConfiguration('rdfusion')
									.get('turtle.autocomplete', defaultTurtleAutocomplete)
							},
							jsonld: {
								validations: workspace
									.getConfiguration('rdfusion')
									.get('jsonld.validations', defaultJsonLdValidations),
								
								autocomplete: workspace
									.getConfiguration('rdfusion')
									.get('jsonld.autocomplete', defaultJsonLdAutocomplete)
							}
						}
					}
				});
				refreshStatus();
			}
		})
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
	
			const doc = await vscode.workspace.openTextDocument({
				language: 'turtle',
				content: filteredText
			});
			vscode.window.showTextDocument(doc, { preview: false });
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

	refreshStatus();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
