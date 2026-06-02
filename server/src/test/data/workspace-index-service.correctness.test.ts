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
import { LocalTermCache } from '../../business/autocomplete/term-completion/local-term-cache';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } as any,
  } as any as Connection;
}

const shapeV1 = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.com/> .
ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [ sh:path ex:name ; sh:name "name" ; sh:minCount 1 ] .
`;

const shapeV2 = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.com/> .
ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [ sh:path ex:email ; sh:name "email" ; sh:minCount 1 ] .
`;

describe('WorkspaceIndexService correctness boundaries', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('updates the SHACL registry on changed shape files and clears it on delete', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rdfusion-index-correctness-'));
    const file = join(tempDir, 'shape.ttl');
    const uri = pathToFileURL(file).toString();

    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const registry = new ShaclRegistry([]);
    const onChanged = vi.fn();
    const onSnapshotChanged = vi.fn();
    const onSnapshotRemoved = vi.fn();
    const service = new WorkspaceIndexService(
      dataManager,
      shapeManager,
      registry,
      connection,
      onChanged,
      undefined,
      onSnapshotChanged,
      onSnapshotRemoved,
    );

    await writeFile(file, shapeV1, 'utf8');
    const first = await service.indexWorkspaceFiles([{ uri, version: 1 }], { final: true });
    expect(first.indexed).toBe(1);
    expect(registry.getPropertiesForClass('http://example.com/Person').map(prop => prop.predicate)).toEqual(['http://example.com/name']);
    expect(onSnapshotChanged).toHaveBeenCalledWith(uri);

    await writeFile(file, shapeV2, 'utf8');
    const second = await service.indexWorkspaceFiles([{ uri, version: 2 }], { final: true });
    expect(second.indexed).toBe(1);
    expect(registry.getPropertiesForClass('http://example.com/Person').map(prop => prop.predicate)).toEqual(['http://example.com/email']);

    const removed = service.removeFile(uri, true);
    expect(removed.shapes).toBe(0);
    expect(registry.getPropertiesForClass('http://example.com/Person')).toEqual([]);
    expect(dataManager.getSnapshot(uri)).toBeUndefined();
    expect(shapeManager.listShapes().files).toEqual([]);
    expect(onSnapshotRemoved).toHaveBeenCalledWith(uri);
  });

  it('keeps local term cache aligned when non-shape RDF files change and are removed', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rdfusion-index-rdf-lifecycle-'));
    const file = join(tempDir, 'data.ttl');
    const uri = pathToFileURL(file).toString();

    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const registry = new ShaclRegistry([]);
    const localTerms = new LocalTermCache(dataManager);
    const service = new WorkspaceIndexService(
      dataManager,
      shapeManager,
      registry,
      connection,
      vi.fn(),
      undefined,
      indexedUri => localTerms.updateUri(indexedUri),
      removedUri => localTerms.removeUri(removedUri),
    );

    await writeFile(file, '@prefix ex: <http://example.com/> .\nex:Alice ex:knows ex:Bob .\n', 'utf8');
    const first = await service.indexWorkspaceFiles([{ uri, version: 1 }], { final: true });
    expect(first.indexed).toBe(1);
    expect(first.shapes).toBe(0);
    expect(dataManager.getSnapshot(uri)?.version).toBe(1);
    expect(localTerms.get('ex')).toEqual(new Set(['Alice', 'knows', 'Bob']));

    await writeFile(file, '@prefix ex: <http://example.com/> .\nex:Carol ex:knows ex:Dave .\n', 'utf8');
    const second = await service.indexWorkspaceFiles([{ uri, version: 2 }], { final: true });
    expect(second.indexed).toBe(1);
    expect(dataManager.getSnapshot(uri)?.version).toBe(2);
    expect(localTerms.get('ex')).toEqual(new Set(['Carol', 'knows', 'Dave']));

    service.removeFile(uri, true);
    expect(dataManager.getSnapshot(uri)).toBeUndefined();
    expect(localTerms.get('ex')).toBeUndefined();
  });


  it('treats SHACL-ness as parsed content so a normal RDF file can start and stop contributing shapes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rdfusion-index-shacl-derived-'));
    const file = join(tempDir, 'mixed.ttl');
    const uri = pathToFileURL(file).toString();

    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const registry = new ShaclRegistry([]);
    const onChanged = vi.fn();
    const service = new WorkspaceIndexService(
      dataManager,
      shapeManager,
      registry,
      connection,
      onChanged,
    );

    await writeFile(file, '@prefix ex: <http://example.com/> .\nex:Alice ex:name "Alice" .\n', 'utf8');
    const dataOnly = await service.indexWorkspaceFiles([{ uri, version: 1 }], { final: true });
    expect(dataOnly.indexed).toBe(1);
    expect(dataOnly.shapes).toBe(0);
    expect(shapeManager.getShapeCountForUri(uri)).toBe(0);
    expect(registry.getPropertiesForClass('http://example.com/Person')).toEqual([]);

    await writeFile(file, shapeV1, 'utf8');
    const withShape = await service.indexWorkspaceFiles([{ uri, version: 2 }], { final: true });
    expect(withShape.indexed).toBe(1);
    expect(withShape.shapes).toBeGreaterThan(0);
    expect(shapeManager.getShapeCountForUri(uri)).toBeGreaterThan(0);
    expect(registry.getPropertiesForClass('http://example.com/Person').map(prop => prop.predicate)).toEqual(['http://example.com/name']);
    expect(onChanged).toHaveBeenCalledTimes(1);

    await writeFile(file, '@prefix ex: <http://example.com/> .\nex:Bob ex:name "Bob" .\n', 'utf8');
    const dataAgain = await service.indexWorkspaceFiles([{ uri, version: 3 }], { final: true });
    expect(dataAgain.indexed).toBe(1);
    expect(dataAgain.shapes).toBe(0);
    expect(shapeManager.getShapeCountForUri(uri)).toBe(0);
    expect(registry.getPropertiesForClass('http://example.com/Person')).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

});
