import { Connection } from "vscode-languageserver/node.js";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { DataManager } from "./data-manager.js";
import { ShapeManager } from "./shacl/shape-manager.js";
import { ShaclRegistry } from "../business/autocomplete/shacl-based/shacl-registry.js";
import { ParsedGraph, JsonldParsedGraph } from "./irdf-parser";
import { PerformanceTracer } from "../utils/performance-trace.js";

export interface WorkspaceIndexFileEntry {
  uri: string;
  version?: number;
  size?: number;
}

export interface WorkspaceIndexResult {
  indexed: number;
  skippedUnchanged: number;
  failed: number;
  shapes: number;
  revision: number;
}

export interface WorkspaceIndexOptions {
  final?: boolean;
  refreshDiagnostics?: boolean;
}

function isFileUri(uri: string): boolean {
  return uri.startsWith("file://");
}

async function readWorkspaceFileText(uri: string): Promise<string> {
  if (!isFileUri(uri)) {
    throw new Error(`Only file:// URIs can be indexed from disk: ${uri}`);
  }
  return readFile(fileURLToPath(uri), "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Server-side owner of workspace indexing side effects.
 *
 * It coordinates parsed snapshots, SHACL shape indexes, autocomplete SHACL
 * registry updates, and diagnostic invalidation. Client code should send file
 * URI/version metadata only; parsing and cache decisions live here.
 */
export class WorkspaceIndexService {
  private knownVersions = new Map<string, number>();
  private knownShapeFiles = new Set<string>();
  private revision = 0;

  constructor(
    private readonly dataManager: DataManager,
    private readonly shapeManager: ShapeManager,
    private readonly shaclRegistry: ShaclRegistry,
    private readonly connection: Connection,
    private readonly onIndexChanged: () => void,
    private readonly tracer?: PerformanceTracer,
    private readonly onSnapshotChanged?: (uri: string) => void,
    private readonly onSnapshotRemoved?: (uri: string) => void,
  ) {}

  /**
   * Index RDF workspace files and refresh every derived view owned by the server.
   *
   * A file does not have to be SHACL-specific to come through this path. Normal
   * RDF data files update parsed snapshots/local terms, and files that contain
   * SHACL shapes update the shape index as a derived result of parsed content.
   */
  async indexWorkspaceFiles(
    files: WorkspaceIndexFileEntry[],
    options: WorkspaceIndexOptions = {},
  ): Promise<WorkspaceIndexResult> {
    const run = async () => {
      let indexed = 0;
      let skippedUnchanged = 0;
      let failed = 0;
      let changed = false;

      for (const file of files) {
        if (!file?.uri) continue;
        try {
          const version = typeof file.version === "number" ? file.version : Date.now();
          if (this.isUnchanged(file.uri, version)) {
            skippedUnchanged++;
            await yieldToEventLoop();
            continue;
          }

          const text = await readWorkspaceFileText(file.uri);
          const parsedGraph = await this.dataManager.parseDocument(file.uri, text, version);
          this.onSnapshotChanged?.(file.uri);
          const beforeRevision = this.shapeManager.getRevision();
          this.shapeManager.updateShapeIndex(file.uri, parsedGraph);
          const fileShapeCount = this.shapeManager.getShapeCountForUri(file.uri);
          this.knownVersions.set(file.uri, version);
          if (fileShapeCount > 0) {
            this.knownShapeFiles.add(file.uri);
          } else {
            this.knownShapeFiles.delete(file.uri);
          }
          indexed++;
          if (this.shapeManager.getRevision() !== beforeRevision) {
            changed = true;
          }
        } catch (error: unknown) {
          failed++;
          this.connection.console.error(
            `[Workspace Index] ${file.uri}: ${errorMessage(error)}`,
          );
        } finally {
          await yieldToEventLoop();
        }
      }

      if (changed) {
        this.revision++;
        this.refreshDerivedState(options);
      }

      return {
        indexed,
        skippedUnchanged,
        failed,
        shapes: this.shapeManager.getTotalShapeCount(),
        revision: this.revision,
      };
    };

    return this.tracer
      ? this.tracer.time("workspace.indexWorkspaceFiles", run, {
          files: files.length,
          final: options.final !== false,
        })
      : run();
  }


  /**
   * Compatibility wrapper for older call-sites. Use indexWorkspaceFiles for new
   * code; server-side indexing always parses RDF data first and extracts SHACL
   * shapes as a derived concern.
   */
  async indexShaclFiles(
    files: WorkspaceIndexFileEntry[],
    options: WorkspaceIndexOptions = {},
  ): Promise<WorkspaceIndexResult> {
    return this.indexWorkspaceFiles(files, options);
  }

  async indexParsedRdf(uri: string, text: string, version: number): Promise<void> {
    const parsedGraph = await this.dataManager.parseDocument(uri, text, version);
    this.indexParsedGraph(uri, parsedGraph, version, true);
  }

  removeFile(uri: string, refreshDiagnostics = true): WorkspaceIndexResult {
    const hadVersion = this.knownVersions.delete(uri);
    const hadShapeFile = this.knownShapeFiles.delete(uri);
    const beforeRevision = this.shapeManager.getRevision();
    this.dataManager.removeParsedData(uri);
    this.onSnapshotRemoved?.(uri);
    this.shapeManager.removeShapeIndex(uri);
    const shapeChanged = this.shapeManager.getRevision() !== beforeRevision;
    if (hadVersion || hadShapeFile || shapeChanged) {
      this.revision++;
      this.refreshDerivedState({ final: true, refreshDiagnostics });
    }
    return {
      indexed: 0,
      skippedUnchanged: 0,
      failed: 0,
      shapes: this.shapeManager.getTotalShapeCount(),
      revision: this.revision,
    };
  }

  getRevision(): number {
    return this.revision;
  }

  getStats(): { revision: number; knownFiles: number; shapeFiles: number } {
    return {
      revision: this.revision,
      knownFiles: this.knownVersions.size,
      shapeFiles: this.knownShapeFiles.size,
    };
  }

  private indexParsedGraph(
    uri: string,
    parsedGraph: ParsedGraph | JsonldParsedGraph,
    version: number,
    refreshDiagnostics: boolean,
  ): void {
    const beforeRevision = this.shapeManager.getRevision();
    this.shapeManager.updateShapeIndex(uri, parsedGraph);
    this.onSnapshotChanged?.(uri);
    this.knownVersions.set(uri, version);
    if (this.shapeManager.getShapeCountForUri(uri) > 0) {
      this.knownShapeFiles.add(uri);
    } else {
      this.knownShapeFiles.delete(uri);
    }
    if (this.shapeManager.getRevision() !== beforeRevision) {
      this.revision++;
      this.refreshDerivedState({ final: true, refreshDiagnostics });
    }
  }

  private isUnchanged(uri: string, version: number): boolean {
    return this.knownVersions.get(uri) === version && this.dataManager.getCachedVersion(uri) === version;
  }

  private refreshDerivedState(options: WorkspaceIndexOptions): void {
    this.shaclRegistry.update(this.shapeManager.getGlobalShapes());
    if (options.refreshDiagnostics === false) {
      return;
    }
    if (options.final !== false) {
      this.onIndexChanged();
    }
  }
}
