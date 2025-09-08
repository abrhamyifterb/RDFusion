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
  return { get: () => TextDocument.create(uri, 'turtle', 1, text) } as unknown as TextDocuments<TextDocument>;
}

const shapeManagerFrom = (shapes: any) => ({ getGlobalShapes: () => [shapes] });

describe('validation: Turtle + SHACL (ValidationManager + DataManager)', () => {
  it('reports SHACL violations for non-conforming data', async () => {
    const uriShapes = 'file:///shapes.ttl';
    const uriData = 'file:///shaclData.invalid.ttl';

    const dm = new DataManager(new Cache(10), mockConnection());
    const shapesText = FIX('shapes.ttl');
    const dataText = FIX('shaclData.invalid.ttl');

    const shapes = await dm.parseDocument(uriShapes, shapesText, 1);
    await dm.parseDocument(uriData, dataText, 1);

    const cfg: any = {
      turtle: { validations: {
        missingTagCheck: false,
        xsdTypeCheck: false,
        languageTag: false,
        duplicateTriple: false,
        shaclConstraint: true
      }},
      common: { validations: { iriSchemeCheck: false }}
    };

    const shapesMgr = shapeManagerFrom(shapes);
    const vm = new ValidationManager(dm,  shapesMgr as any, docs(uriData, dataText), cfg);
    const diags = await vm.validate(uriData);

    expect(diags.length).toBeGreaterThan(0);
    expect(diags.some(d => (d.source || '').toLowerCase().includes('shacl'))).toBe(true);
    expect(diags.some(d => d.severity === 2 /* Warning */)).toBe(true);
  });

  it('produces no SHACL diagnostics for conforming data', async () => {
    const uriShapes = 'file:///shapes.ttl';
    const uriData = 'file:///shaclData.valid.ttl';

    const dm = new DataManager(new Cache(10), mockConnection());
    const shapesText = FIX('shapes.ttl');
    const dataText = FIX('shaclData.valid.ttl');

    const shapes = await dm.parseDocument(uriShapes, shapesText, 1);
    await dm.parseDocument(uriData, dataText, 1);

    const cfg: any = {
      turtle: { validations: {
        missingTagCheck: false,
        xsdTypeCheck: false,
        languageTag: false,
        duplicateTriple: false,
        shaclConstraint: true
      }},
      common: { validations: { iriSchemeCheck: false }}
    };

    const shapesMgr = shapeManagerFrom(shapes);
    const vm = new ValidationManager(dm,  shapesMgr as any, docs(uriData, dataText), cfg);
    const diags = await vm.validate(uriData);

    expect(diags.some(d => (d.source || '').toLowerCase().includes('shacl'))).toBe(false);
  });
});
