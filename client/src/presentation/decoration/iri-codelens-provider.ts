import * as vscode from 'vscode';
import { buildIriKey } from '../../utils/iri-shortener';
import { DecorationManager } from './decoration-manager';
import { getIriShortenConfig } from '../../default-config/shorten-config';

export class IriCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private decoMgr: DecorationManager) {}

  public refresh() {
    this._onDidChange.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const { enabled } = getIriShortenConfig();
    if (!enabled || doc.languageId !== 'turtle') {
      return [];
    }
    
    const lenses: vscode.CodeLens[] = [];
    const lineCount = doc.lineCount;
    const IRI_REGEX = /<([^>]+)>/g;

    for (let line = 0; line < lineCount; line++) {
      const lineText = doc.lineAt(line).text;
      let match: RegExpExecArray | null;
      while ((match = IRI_REGEX.exec(lineText))) {
        const iri     = match[1];
        const charIndex = match.index;                         
        const key     = buildIriKey(iri, doc.offsetAt(new vscode.Position(line, charIndex)));

        const start = new vscode.Position(line, match.index!);
        const end   = start.translate(0, 1); 
        lenses.push(new vscode.CodeLens(
          new vscode.Range(start, end),
          {
            command:   'rdfusion.toggleOneIri',
            title:     this.decoMgr.isOpen(key) ? 'Shorten IRI' : 'Expand IRI',
            arguments: [doc.uri, key]
          }
        ));
      }
    }
    return lenses;
  }
}
