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
  getIanaSchemes: vi.fn(async () => new Set(['http','https']))
}));

const FIX = (name: string) => readFileSync(join(__dirname, '..', '..', '..', 'fixtures', name), 'utf8');

function mockConnection(): any {
  return { console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } };
}
function docs(uri: string, text: string) {
  return { get: () => TextDocument.create(uri, 'json', 1, text) } as unknown as TextDocuments<TextDocument>;
}

const shapes = { getGlobalShapes: () => [] };

describe('JSON-LD integration (ValidationManager with DataManager)', () => {
  it('rules applied', async () => {
    const uri = 'file:///invalidJsonld.jsonld';
    const text = FIX('invalidJsonld.jsonld');

    const dm = new DataManager(new Cache(10), mockConnection());
    await dm.parseDocument(uri, text, 1);

    const cfg: any = {
      jsonld: { validations: {} },
      common: { validations: { iriSchemeCheck: false } },
      turtle: { validations: { shaclConstraint: false } }
    };

    const vm = new ValidationManager(dm, shapes as any, docs(uri, text),  cfg);
    const diags = await vm.validate(uri);

    const has = (re: RegExp) => diags.some(d => re.test(d.message));

    expect(has(/Undefined prefix/i)).toBe(true);  
    expect(has(/bcp-47/i)).toBe(true); 
  });

  it('valid JSON-LD produces no errors', async () => {
    const uri = 'file:///valid.jsonld';
    const text = FIX('valid.jsonld');

    const dm = new DataManager(new Cache(10), mockConnection());
    await dm.parseDocument(uri, text, 1);

    const cfg: any = {
      jsonld: { validations: {} },
      common: { validations: { iriSchemeCheck: false } },
      turtle: { validations: { shaclConstraint: false } }
    };

    const vm = new ValidationManager(dm,  shapes as any, docs(uri, text), cfg);
    const diags = await vm.validate(uri);
    const msg = diags.map(d => d.message).join('\n');
    expect(/Undefined prefix|BCP-47|missing\s*@value|cannot be null/i.test(msg)).toBe(false);
  });
});