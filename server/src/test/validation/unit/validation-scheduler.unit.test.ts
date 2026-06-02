/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { DiagnosticSeverity, type Connection } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { ValidationScheduler } from '../../../business/validation/validation-scheduler';
import type { ValidationManager } from '../../../business/validation/validation-manager';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } as any,
    sendDiagnostics: vi.fn(),
  } as any as Connection;
}

function doc(uri: string, version: number): TextDocument {
  return TextDocument.create(uri, 'turtle', version, '@prefix ex:<http://ex/> . ex:a ex:p ex:b .');
}

describe('ValidationScheduler', () => {
  it('caches diagnostics by document/config/shape/selection revision', async () => {
    const uri = 'file:///a.ttl';
    let currentDoc = doc(uri, 1);
    let shapeRevision = 0;
    const documents = {
      get: vi.fn((u: string) => (u === uri ? currentDoc : undefined)),
      all: vi.fn(() => [currentDoc]),
    } as any;
    const validate = vi.fn(async () => [{
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      message: 'diagnostic',
      severity: DiagnosticSeverity.Warning,
    }]);
    const scheduler = new ValidationScheduler(
      mockConnection(),
      documents,
      { validate } as any as ValidationManager,
      undefined,
      {
        debounceMs: 1,
        concurrency: 1,
        getContext: () => ({ configRevision: 0, shapeRevision, selectionRevision: 0 }),
      },
    );

    await scheduler.getDiagnostics(uri, 'pull');
    await scheduler.getDiagnostics(uri, 'pull');
    expect(validate).toHaveBeenCalledTimes(1);

    shapeRevision++;
    await scheduler.getDiagnostics(uri, 'pull');
    expect(validate).toHaveBeenCalledTimes(2);

    currentDoc = doc(uri, 2);
    await scheduler.getDiagnostics(uri, 'pull');
    expect(validate).toHaveBeenCalledTimes(3);
  });

  it('does not publish diagnostics produced for an obsolete document version', async () => {
    const uri = 'file:///stale.ttl';
    const connection = mockConnection();
    let currentDoc = doc(uri, 1);
    const documents = {
      get: vi.fn((u: string) => (u === uri ? currentDoc : undefined)),
      all: vi.fn(() => [currentDoc]),
    } as any;
    const validate = vi.fn(async () => {
      currentDoc = doc(uri, 2);
      return [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message: 'stale',
        severity: DiagnosticSeverity.Warning,
      }];
    });
    const scheduler = new ValidationScheduler(
      connection,
      documents,
      { validate } as any as ValidationManager,
      undefined,
      {
        debounceMs: 0,
        concurrency: 1,
        getContext: () => ({ configRevision: 0, shapeRevision: 0, selectionRevision: 0 }),
      },
    );

    scheduler.schedule(uri, 'change');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(validate).toHaveBeenCalledTimes(1);
    expect(connection.sendDiagnostics).not.toHaveBeenCalled();
  });

  it('deduplicates identical diagnostics before publishing', async () => {
    const uri = 'file:///duplicate.ttl';
    const connection = mockConnection();
    const currentDoc = doc(uri, 1);
    const documents = {
      get: vi.fn((u: string) => (u === uri ? currentDoc : undefined)),
      all: vi.fn(() => [currentDoc]),
    } as any;
    const duplicateDiagnostic = {
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 6 } },
      message: 'same warning',
      severity: DiagnosticSeverity.Warning,
      source: 'rdfusion',
    };
    const validate = vi.fn(async () => [
      duplicateDiagnostic,
      { ...duplicateDiagnostic },
      {
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
        message: 'different warning',
        severity: DiagnosticSeverity.Warning,
        source: 'rdfusion',
      },
    ]);
    const scheduler = new ValidationScheduler(
      connection,
      documents,
      { validate } as any as ValidationManager,
      undefined,
      {
        debounceMs: 0,
        concurrency: 1,
        getContext: () => ({ configRevision: 0, shapeRevision: 0, selectionRevision: 0 }),
      },
    );

    scheduler.schedule(uri, 'change');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(connection.sendDiagnostics).toHaveBeenCalledTimes(1);
    expect((connection.sendDiagnostics as any).mock.calls[0][0].diagnostics).toHaveLength(2);
  });

});
