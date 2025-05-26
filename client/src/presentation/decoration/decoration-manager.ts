import * as vscode from 'vscode';
import { getIriShortenConfig } from '../../default-config/shorten-config';
import { buildIriKey, makeShort } from '../../utils/iri-shortener';

export class DecorationManager implements vscode.Disposable {
	private openKeys = new Set<string>();
	private decorationType: vscode.TextEditorDecorationType;

	constructor() {
		this.decorationType = vscode.window.createTextEditorDecorationType({
			textDecoration: 'none; font-size: 0',
			before: {
				contentText: '',        
				margin: '0 0.2em 0 0'
			}
		});
	}

	public update(editor: vscode.TextEditor) {
		const { enabled, maxLength } = getIriShortenConfig();
		if (!enabled) {
			editor.setDecorations(this.decorationType, []);
			return;
		}

		const IRI_PUNCTUATION_REGEX = /<([^>]+)>(?:[ \t]*([.;])[ \t]*)?/g;
		const text = editor.document.getText();
		const ranges: vscode.DecorationOptions[] = [];

		for (const m of text.matchAll(IRI_PUNCTUATION_REGEX)) {
			const fullIri   = m[1];
			const punctuation     = m[2] || '';
			const fullMatch = m[0];            
			const key       = buildIriKey(fullIri, m.index!);
			if (this.openKeys.has(key)) continue;

			const short = makeShort(fullIri, maxLength);
			if (!short) continue;

			const start = editor.document.positionAt(m.index!);
			const offsetEnd = m.index! + fullMatch.length;
			const documentEnd = editor.document.positionAt(offsetEnd);
			
			const hideRange = new vscode.Range(
				start.translate(0, 1), 
				documentEnd
			);
			
			const shortInner = short.slice(1);
			ranges.push({
				range: hideRange,
				renderOptions: {
					before: { contentText: shortInner + (punctuation ? punctuation + ' ' : '') }
				},
				hoverMessage: fullMatch.trimEnd()
			});
		}

		editor.setDecorations(this.decorationType, ranges);
	}
	
	public isOpen(key: string): boolean {
		return this.openKeys.has(key);
	}
	
	public toggle(key: string) {
		if (this.openKeys.has(key)) {
			this.openKeys.delete(key);
		}
		else {
			this.openKeys.add(key);
		}
	}

	public dispose() {
		this.decorationType.dispose();
	}
}
