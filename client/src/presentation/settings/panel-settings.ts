/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';

interface SectionConfig {
	key: string;
	title: string;
	defaults: Record<string, boolean | number | string>;
	labels: Record<string, string>;
}

const sections: SectionConfig[] = [
	{
		key: 'turtle.validations',
		title: 'Turtle Validations',
		defaults: {
		xsdTypeCheck: true,
		missingTagCheck: true,
		shaclConstraint: true,
		duplicateTriple: true
		},
		labels: {
		xsdTypeCheck: 'XSD Type Check',
		missingTagCheck: 'Missing Tag/Datatype',
		shaclConstraint: 'SHACL Constraint',
		duplicateTriple: 'Duplicate Triple'
		}
	},
	{
		key: 'turtle.autocomplete',
		title: 'Turtle Autocomplete',
		defaults: {
			localBased: true,
			remoteBased: true,
			prefixDeclaration: true
		},
		labels: {
			localBased: 'Local Terms',
			remoteBased: 'Remote Terms',
			prefixDeclaration: 'Prefix Declaration'
		}
	},
	{
		key: 'jsonld.validations',
		title: 'JSON-LD Validations',
		defaults: {
			duplicateId: true,
			missingType: true,
			undefinedPrefix: true,
			missingTagCheck: true,
			xsdTypeCheck: true,
			emptyLiteral: true,
			nonStringLiteral: true,
			shaclConstraint: true,
			duplicateTriple: true
		},
		labels: {
			duplicateId: 'Duplicate @id',
			missingType: 'Missing @type',
			undefinedPrefix: 'Undefined Prefix',
			missingTagCheck: 'Missing @type/@lang',
			xsdTypeCheck: 'XSD-Datatype Check',
			emptyLiteral: 'Empty Literal',
			nonStringLiteral: 'Non-String Literal',
			shaclConstraint: 'SHACL Constraint',
			duplicateTriple: 'Duplicate Triple'
		}
	},
	{
		key: 'jsonld.autocomplete',
		title: 'JSON-LD Autocomplete',
		defaults: {
			localBased: true,
			remoteBased: true,
			prefixDeclaration: true
		},
		labels: {
			localBased: 'Local Terms',
			remoteBased: 'Remote Terms',
			prefixDeclaration: 'Prefix Declaration'
		}
	},
	{
		key: 'turtle.irishorten',
		title: 'Turtle IRI Shortening',
		defaults: {
			enabled: false,
			maxLength: 30
		},
		labels: {
			enabled: 'Enable IRI Shortening',
			maxLength: 'Maximum IRI Length'
		}
	},
	{
		key: 'turtle.formatting',
		title: 'Turtle Formatting',
		defaults: {
			breakSubject: true,
			blankLineBetweenSubjects: true,
			breakPredicates: true,
			breakObjects: false,
			breakPredObj: false,
			useKnownPrefixes: true,
			useUntypedNumeric: true,
			compactSingletonLists: true,
			indentSize: 2
		},
		labels: {
			breakSubject: 'Break Subject',
			blankLineBetweenSubjects: 'Blank Line Between Subjects',
			breakPredicates: 'Break Predicates',
			breakObjects: 'Break Objects',
			breakPredObj: 'Align Pred/Obj',
			useKnownPrefixes: 'Use Known Prefixes',
			useUntypedNumeric: 'Use Untyped Numeric',
			compactSingletonLists: 'Compact Singleton Lists',
			indentSize: 'Indent Size'
		}
	},
	{
		key: 'common.validations',
		title: 'IRI Scheme Validation',
		defaults: {
			iriSchemeCheck: true,
			strictSchemeCheck: false,
			customIriScheme: 'http, https, mailto, tel'
		},
		labels: {
			iriSchemeCheck: 'Check Non-Standard Schemes',
			strictSchemeCheck: 'Strict Mode',
			customIriScheme: 'Custom Scheme Whitelist'
		}
	}
];

export class SettingsPanel {
	public static currentPanel: SettingsPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, private extensionUri: vscode.Uri) {
		this.panel = panel;
		this.update();

		this.disposables.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('rdfusion')) {
			this.update();
			}
		})
		);

		this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this), null, this.disposables);
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
	}

	public static createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor?.viewColumn;
		if (SettingsPanel.currentPanel) {
		SettingsPanel.currentPanel.panel.reveal(column);
		} else {
		const panel = vscode.window.createWebviewPanel(
			'rdfusionSettings',
			'RDFusion Settings',
			column || vscode.ViewColumn.One,
			{ enableScripts: true }
		);
		SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
		}
	}

	public dispose() {
		SettingsPanel.currentPanel = undefined;
		this.panel.dispose();
		this.disposables.forEach(d => d.dispose());
	}

	private update() {
		const cfg = vscode.workspace.getConfiguration('rdfusion');
		const data = sections.map(s => ({
		key: s.key,
		title: s.title,
		defaults: s.defaults,
		labels: s.labels,
		current: cfg.get<Record<string, any>>(s.key, s.defaults)
		}));
		this.panel.webview.html = this.getHtml(data);
	}

	private async handleMessage(msg: any) {
		if (msg.command === 'save') {
		const cfg = vscode.workspace.getConfiguration('rdfusion');
		try {
			await cfg.update(msg.sectionKey, msg.values, vscode.ConfigurationTarget.Global);
			this.update();
			this.panel.webview.postMessage({ command: 'saved', sectionKey: msg.sectionKey });
		} catch (err: any) {
			this.panel.webview.postMessage({ command: 'error', error: err.message });
		}
		}
	}

	private getHtml(data: any[]): string {
		const nonce = Date.now().toString();
		const sectionsHtml = data.map(section => {
		const inputs = Object.keys(section.defaults).map(key => {
			const def = section.defaults[key];
			const val = section.current[key];
			const label = section.labels[key] ?? key;
			if (typeof def === 'boolean') {
			return `<label style="display:block;">
						<input type="checkbox" name="${section.key}::${key}" ${val ? 'checked' : ''}/>
						${label}
					</label>`;
			} else if (typeof def === 'number') {
			return `<label style="display:block;">
						${label}:
						<input type="number" name="${section.key}::${key}" value="${val}"/>
					</label>`;
			} else {
			return `<label style="display:block;">
						${label}:
						<input type="text" name="${section.key}::${key}" value="${val}"/>
					</label>`;
			}
		}).join('\n');
		return `
			<fieldset style="margin-bottom:1em;">
			<legend><strong>${section.title}</strong></legend>
			${inputs}
			<button type="button" data-section="${section.key}">
				Save ${section.title}
			</button>
			</fieldset>`;
		}).join('\n');

		return `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta http-equiv="Content-Security-Policy"
						content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
				<title>RDFusion Settings</title>
			</head>
			<body>
				<h1>RDFusion Settings</h1>
				${sectionsHtml}
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					document.querySelectorAll('button[data-section]').forEach(btn =>
					btn.addEventListener('click', () => {
						const sec = btn.getAttribute('data-section');
						const values = {};
						document.querySelectorAll(\`[name^="\${sec}::"]\`).forEach(input => {
						const [, k] = input.name.split('::');
						if (input.type === 'checkbox') values[k]=input.checked;
						else if (input.type === 'number') values[k]=Number(input.value);
						else values[k]=input.value;
						});
						vscode.postMessage({ command:'save', sectionKey:sec, values });
					})
					);
					window.addEventListener('message', e => {
					const m=e.data;
					if (m.command==='saved') alert(\`\${m.sectionKey} saved!\`);
					if (m.command==='error') alert('Error: '+m.error);
					});
				</script>
			</body>
		</html>`;
	}
}
