/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Connection } from "vscode-languageserver/node.js";

import { Cache } from "../../data/cache/lru-cache";
import { DataManager } from "../../data/data-manager";
import { ShapeManager } from "../../data/shacl/shape-manager";
import { WorkspaceIndexService } from "../../data/workspace-index-service";
import { ShaclRegistry } from "../../business/autocomplete/shacl-based/shacl-registry";

function mockConnection(): Connection {
  return {
    console: {
      error: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as any,
  } as any as Connection;
}

function quad(s: string, p: string, o: string) {
  return {
    subject: { value: s },
    predicate: { value: p },
    object: { value: o },
  };
}

function graphForShape(index: number, propertyCount = 3) {
  const SH = "http://www.w3.org/ns/shacl#";
  const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const shape = `http://example.com/Shape${index}`;
  const quads = [
    quad(shape, RDF_TYPE, `${SH}NodeShape`),
    quad(shape, `${SH}targetClass`, `http://example.com/Class${index % 20}`),
    quad(shape, `${SH}name`, `Shape ${index}`),
    quad(shape, `${SH}message`, `Shape ${index} message`),
  ];
  for (let p = 0; p < propertyCount; p++) {
    const prop = `_:shape${index}prop${p}`;
    quads.push(quad(shape, `${SH}property`, prop));
    quads.push(quad(prop, `${SH}path`, `http://example.com/p${p}`));
    quads.push(quad(prop, `${SH}minCount`, "1"));
    quads.push(quad(prop, `${SH}message`, `Property ${p} is required`));
  }
  return { quads, tokens: [], errors: [], cst: [] } as any;
}

function ttlShape(index: number): string {
  return `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.com/> .

ex:Shape${index} a sh:NodeShape ;
  sh:targetClass ex:Class${index % 20} ;
  sh:message "Shape ${index} message" ;
  sh:property [ sh:path ex:name ; sh:minCount 1 ; sh:message "Name required" ] .
`;
}

describe("large-workspace performance budgets", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("keeps DataManager snapshots bounded while parsing many documents", async () => {
    const connection = mockConnection();
    const maxEntries = 30;
    const dataManager = new DataManager(new Cache(10), connection, undefined, {
      maxSnapshotEntries: maxEntries,
      maxSnapshotBytes: 4 * 1024 * 1024,
    });
    (dataManager as any).rdfParser = {
      parse: async () => ({ quads: [], tokens: [], errors: [], cst: [] }),
    };

    const start = performance.now();
    for (let i = 0; i < 140; i++) {
      await dataManager.parseDocument(
        `file:///large-workspace/doc-${i}.ttl`,
        `@prefix ex:<http://example.com/> . ex:s${i} ex:p ex:o .`,
        i,
      );
    }
    const elapsed = performance.now() - start;

    expect(dataManager.getStats().snapshots).toBeLessThanOrEqual(maxEntries);
    expect(
      dataManager.getSnapshot("file:///large-workspace/doc-0.ttl"),
    ).toBeUndefined();
    expect(
      dataManager.getSnapshot("file:///large-workspace/doc-139.ttl"),
    ).toBeTruthy();
    expect(elapsed).toBeLessThan(15000);
  });

  it("lists many SHACL shapes from compact summaries without compatibility target-group duplication", () => {
    const shapeManager = new ShapeManager(mockConnection());
    const FILES = 250;
    for (let i = 0; i < FILES; i++) {
      shapeManager.updateShapeIndex(
        `file:///workspace/shapes-${i}.ttl`,
        graphForShape(i, 4),
      );
    }

    const start = performance.now();
    const response = shapeManager.listShapes(
      { mode: "auto" },
      { includeTargetGroups: false },
    );
    const elapsed = performance.now() - start;

    expect(response.files).toHaveLength(FILES);
    expect(response.files.reduce((sum, file) => sum + file.shapeCount, 0)).toBe(
      FILES,
    );
    expect(response.files.every((file) => file.targetGroups.length === 0)).toBe(
      true,
    );
    expect(shapeManager.getTotalShapeCount()).toBe(FILES);
    expect(elapsed).toBeLessThan(1000);
  });

  it("indexes a synthetic SHACL workspace once and skips unchanged files on the next pass", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "rdfusion-large-index-"));
    const FILES = 70;
    const entries: { uri: string; version: number; size: number }[] = [];
    for (let i = 0; i < FILES; i++) {
      const path = join(tempDir, `shape-${i}.ttl`);
      const text = ttlShape(i);
      await writeFile(path, text, "utf8");
      entries.push({
        uri: pathToFileURL(path).toString(),
        version: 1,
        size: Buffer.byteLength(text),
      });
    }

    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(50), connection, undefined, {
      maxSnapshotEntries: 200,
      maxSnapshotBytes: 16 * 1024 * 1024,
    });
    (dataManager as any).rdfParser = {
      parse: async (_text: string) => {
        const match = /Shape(\d+)/.exec(_text);
        return graphForShape(match ? Number(match[1]) : 0, 1);
      },
    };
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

    const first = await service.indexWorkspaceFiles(entries, { final: true });
    expect(first.indexed).toBe(FILES);
    expect(first.failed).toBe(0);
    expect(first.shapes).toBe(FILES);
    expect(onChanged).toHaveBeenCalledTimes(1);

    const secondStart = performance.now();
    const second = await service.indexWorkspaceFiles(entries, { final: true });
    const secondElapsed = performance.now() - secondStart;

    expect(second.indexed).toBe(0);
    expect(second.skippedUnchanged).toBe(FILES);
    expect(second.failed).toBe(0);
    expect(second.shapes).toBe(FILES);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(secondElapsed).toBeLessThan(2000);
  });
});
