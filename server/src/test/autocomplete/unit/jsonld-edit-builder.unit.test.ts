/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseAst } from './helpers';
import { TextEdit } from 'vscode-languageserver/node';
import { JsonLdEditBuilder } from '../../../business/autocomplete/prefix/jsonld/jsonld-edit-builder';

describe('JsonLdEditBuilder (unit)', () => {
  it('adds a context mapping when prefix is missing', () => {
    const text = '{ "@context": { "ex": "http://ex/" }, "ex:p": "v" }';
    const doc = TextDocument.create('file:///doc.jsonld','json',1,text);
    const edits: TextEdit[] = [];
    const builder = new JsonLdEditBuilder(doc, text, parseAst(text));
    const ctx = new Map<string,string>([['ex','http://ex/']]);
    builder.ensurePrefixMapping('dc','http://purl.org/dc/terms/', ctx, edits);
    expect(edits.length).toBeGreaterThan(0);
  });
});
