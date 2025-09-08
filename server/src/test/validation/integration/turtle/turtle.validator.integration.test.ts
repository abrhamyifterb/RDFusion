/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ValidationManager } from '../../../../business/validation/validation-manager';
import { Cache } from '../../../../data/cache/lru-cache';
import { DataManager } from '../../../../data/data-manager';

vi.mock('../iana-schemes', () => ({
  getIanaSchemes: vi.fn(async () => new Set(['http', 'https']))
}));

const FIX = (name: string) => readFileSync(join(__dirname, '..', '..', '..', 'fixtures', name), 'utf8');

function mockConnection(): any {
  return { console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } };
}
function docs(uri: string, text: string) {
  return { get: () => TextDocument.create(uri, 'turtle', 1, text) } as unknown as TextDocuments<TextDocument>;
}

const shapes: any = { getGlobalShapes: () => [] };

describe('Turtle integration (ValidationManager + DataManager)', () => {
  it('triggers rules', async () => {
    const uri = 'file:///mix.ttl';
    const text = FIX('mix.ttl');

    const dm = new DataManager(new Cache(10), mockConnection());

    await dm.parseDocument(uri, text, 1);

    const cfg: any = {
      turtle: { validations: {
        missingTagCheck: true,
        xsdTypeCheck: true,
        languageTag: true,
        duplicateTriple: true,
        shaclConstraint: false
      }},
      common: { validations: { iriSchemeCheck: true }}
    };

    const vm = new ValidationManager(dm, shapes, docs(uri, text), cfg);
    const diags = await vm.validate(uri);

    console.dir(diags);
    const hasMsg = (re: RegExp) => diags.some(d => re.test(d.message));
    expect(hasMsg(/missing\s+(?:a\s+)?datatype or language tag/i)).toBe(true);
    expect(hasMsg(/Invalid lexical form/i)).toBe(true);
    expect(hasMsg(/Invalid\s+BCP-47/i)).toBe(true);
    expect(hasMsg(/Duplicate\s+triple/i)).toBe(true);
    expect(hasMsg(/scheme/i)).toBe(true); 
  });
});
