import * as vscode from 'vscode';
import { buildIriKey } from '../../utils/iri-shortener';
import { DecorationManager } from './decoration-manager';
import { getIriShortenConfig } from '../../default-config/shorten-config';

const IRI_REGEX = /<([^>]+)>/g;
const JSONLD_IRI_REGEX = /"([A-Za-z][A-Za-z0-9+.-]*:\/\/[^"]+)"/g;

export class IriCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private decoMgr: DecorationManager) {}

  public refresh() {
    this._onDidChange.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const { enabled } = getIriShortenConfig();
    let regex:RegExp;
    if (!enabled) {
      return [];
    }
    if(doc.languageId === 'turtle') {
      regex = IRI_REGEX;
    }
    else if (doc.languageId === 'jsonld') {
      regex = JSONLD_IRI_REGEX;
    }
    else {
      return [];
    }
    
    const lenses: vscode.CodeLens[] = [];
    const lineCount = doc.lineCount;

    for (let line = 0; line < lineCount; line++) {
      const lineText = doc.lineAt(line).text;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(lineText))) {
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
