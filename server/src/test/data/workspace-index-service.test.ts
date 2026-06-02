/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Connection } from 'vscode-languageserver/node';
import { Cache } from '../../data/cache/lru-cache';
import { DataManager } from '../../data/data-manager';
import { ShapeManager } from '../../data/shacl/shape-manager';
import { WorkspaceIndexService } from '../../data/workspace-index-service';
import { ShaclRegistry } from '../../business/autocomplete/shacl-based/shacl-registry';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), } as any,
  } as any as Connection;
}

const ttlShape = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.com/> .

ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [ sh:path ex:name ; sh:minCount 1 ] .
`;

describe('WorkspaceIndexService', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('indexes SHACL files, skips unchanged versions, and removes deleted files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rdfusion-index-'));
    const file = join(tempDir, 'shape.ttl');
    await writeFile(file, ttlShape, 'utf8');
    const uri = pathToFileURL(file).toString();

    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const registry = new ShaclRegistry([]);
    const onChanged = vi.fn();
    const service = new WorkspaceIndexService(dataManager, shapeManager, registry, connection, onChanged);

    const first = await service.indexWorkspaceFiles([{ uri, version: 1 }], { final: true });
    expect(first.indexed).toBe(1);
    expect(first.failed).toBe(0);
    expect(first.shapes).toBeGreaterThan(0);
    expect(onChanged).toHaveBeenCalledTimes(1);

    const second = await service.indexWorkspaceFiles([{ uri, version: 1 }], { final: true });
    expect(second.indexed).toBe(0);
    expect(second.skippedUnchanged).toBe(1);
    expect(onChanged).toHaveBeenCalledTimes(1);

    const removed = service.removeFile(uri, true);
    expect(removed.shapes).toBe(0);
    expect(dataManager.getSnapshot(uri)).toBeUndefined();
    expect(shapeManager.getShapeCountForUri(uri)).toBe(0);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});
