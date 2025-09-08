/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Connection,
  TextDocuments,
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Position,
  WorkspaceEdit,
  TextEdit,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseTree, findNodeAtOffset } from 'jsonc-parser';
import { DataManager } from '../../../../data/data-manager';
import { JsonldParsedGraph } from '../../../../data/irdf-parser';
import { IriExpectationIndex } from './iri-expectation-index';
import { JsonLdEditBuilder } from './jsonld-edit-builder';
import { PrefixRegistry } from '../prefix-registry';

export class JsonLdRefactorProvider {
  constructor(
    private connection: Connection,
    private dataManager: DataManager,
    private documents: TextDocuments<TextDocument>,
    private registry: PrefixRegistry
  ) {}

  public provideCodeActions = (params: CodeActionParams): CodeAction[] => {
    const uri = params.textDocument.uri;
    const doc = this.documents.get(uri);
    if (!doc) {return [];}

    const parsed = this.dataManager.getParsedData(uri) as JsonldParsedGraph | undefined;
    const text = parsed?.text ?? doc.getText();
    const ast = parsed?.ast ?? parseTree(text);
    if (!ast) {return [];}

    const offset = doc.offsetAt(params.range.start);
    const node = findNodeAtOffset(ast, offset);
    if (!node || node.type !== 'string') {return [];}

    const index = new IriExpectationIndex();
    index.init({ text, ast });

    const isKey = node.parent?.type === 'property' && node.parent.children?.[0] === node;
    const isValue = index.isIriValueStringNode(node);
    if (!isKey && !isValue) {return [];}
    if (isKey && !index.keyIsIriExpected(node)) {return [];}

    let s: string;
    try { s = JSON.parse(text.slice(node.offset, node.offset + node.length)); }
    catch { return []; }

    const sep = Math.max(s.lastIndexOf('#'), s.lastIndexOf('/'));
    if (sep < 0) {return [];}
    const ns = s.slice(0, sep + 1);

    const contextMap = (parsed?.contextMap ?? new Map<string,string>());
    let known: string | undefined;
    
    const match = this.registry.getPrefix(ns); 
    

    if(match) {known = match;}
    console.log(ns + " .................... " + this.registry.getPrefix('http://www.w3.org/2001/XMLSchema#') + "   + " + this.registry.getAll().length + "  " + this.registry.getIri("xsd"));

    const preferred = known ?? this.suggestPrefix(ns, contextMap);
    const title = 'Define a prefix for IRI';

    return [{
      title,
      kind: CodeActionKind.Refactor,
      command: {
        title,
        command: 'jsonld.applyPrefixAndRename',
        arguments: [uri, params.range.start, preferred],
      },
    }];
  };

  public handleApplyPrefixServer = async (args?: any[]): Promise<void> => {
    const [uri, pos, preferred] = (args ?? []) as [string, Position, string?];
    if (!uri || !pos) {return;}

    const parsed = this.dataManager.getParsedData(uri) as JsonldParsedGraph | undefined;
    const doc = this.documents.get(uri);
    if (!parsed || !doc) {return;}

    const { text, ast, contextMap } = parsed;
    const offset = doc.offsetAt(pos);
    const caretNode = findNodeAtOffset(ast, offset);
    if (!caretNode || caretNode.type !== 'string') {return;}

    const index = new IriExpectationIndex();
    index.init({ text, ast });

    const isKey = caretNode.parent?.type === 'property' && caretNode.parent.children?.[0] === caretNode;
    const isValue = index.isIriValueStringNode(caretNode);
    if (!isKey && !isValue) {return;}
    if (isKey && !index.keyIsIriExpected(caretNode)) {return;}

    const s = JSON.parse(text.slice(caretNode.offset, caretNode.offset + caretNode.length));
    const sep = Math.max(s.lastIndexOf('#'), s.lastIndexOf('/'));
    if (sep < 0) {return;}
    const ns = s.slice(0, sep + 1);

    let newPref = preferred ?? this.suggestPrefix(ns, contextMap);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newPref)) {return;}
    const bound = contextMap.get(newPref);
    if (bound && bound !== ns) {newPref = this.makeUnique(newPref, contextMap);}

    const edits: TextEdit[] = [];
    const builder = new JsonLdEditBuilder(doc, text, ast);
    builder.replaceNamespaceInEligiblePositions(ns, newPref, index, edits);
    builder.ensurePrefixMapping(newPref, ns, contextMap, edits);

    const ws: WorkspaceEdit = { changes: { [uri]: edits } };
    const res = await this.connection.workspace.applyEdit(ws);
    if (res?.applied) {contextMap.set(newPref, ns);}
  };

  private suggestPrefix(ns: string, ctx: Map<string, string>): string {
    const last = ns.replace(/[#/]+$/, '').split(/[#/]/).pop() || 'ex';
    let base = last.replace(/[^A-Za-z0-9_]/g, '');
    if (!/^[A-Za-z_]/.test(base)) {base = 'ns';}
    base = base.slice(0, 12) || 'ns';
    return this.makeUnique(base, ctx);
  }
  private makeUnique(base: string, ctx: Map<string, string>): string {
    let cand = base, i = 1;
    while (ctx.has(cand)) { cand = `${base}${i++}`; }
    return cand;
  }
}
