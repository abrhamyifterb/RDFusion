/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection } from "vscode-languageserver/node.js";
import {
  CachedParsedGraph,
  JsonldParsedGraph,
  ParsedGraph,
} from "./irdf-parser";
import { RDFParser } from "./rdf-parser.js";
import { Cache } from "./cache/lru-cache";
import {
  DocumentSnapshot,
  RDFusionFileType,
  snapshotToCachedParsedGraph,
} from "./document-snapshot.js";
import { PerformanceTracer } from "../utils/performance-trace.js";

export interface DataManagerOptions {
  /** Maximum number of parsed document snapshots kept in the canonical store. */
  maxSnapshotEntries?: number;
  /** Approximate source-text byte budget for retained parsed document snapshots. */
  maxSnapshotBytes?: number;
}

export interface DataManagerStats {
  snapshots: number;
  totalSnapshotBytes: number;
  maxSnapshotEntries: number;
  maxSnapshotBytes: number;
}

const DEFAULT_MAX_SNAPSHOT_ENTRIES = 500;
const DEFAULT_MAX_SNAPSHOT_BYTES = 128 * 1024 * 1024;

export class DataManager {
  /**
   * Canonical parsed-document store. Map insertion order is used as a simple
   * LRU list: every successful read moves the entry to the back.
   */
  private snapshots = new Map<string, DocumentSnapshot>();
  private totalSnapshotBytes = 0;
  private rdfParser: RDFParser;
  private readonly maxSnapshotEntries: number;
  private readonly maxSnapshotBytes: number;

  constructor(
    private cache: Cache<string, CachedParsedGraph>,
    private connection: Connection,
    private tracer?: PerformanceTracer,
    options: DataManagerOptions = {},
  ) {
    this.rdfParser = new RDFParser();
    this.maxSnapshotEntries = Math.max(
      1,
      options.maxSnapshotEntries ?? DEFAULT_MAX_SNAPSHOT_ENTRIES,
    );
    this.maxSnapshotBytes = Math.max(
      1024 * 1024,
      options.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES,
    );
  }

  findFileFormat(uri: string): RDFusionFileType {
    const lower = uri.toLowerCase();
    return lower.endsWith(".ttl")
      ? "turtle"
      : lower.endsWith(".jsonld")
        ? "jsonld"
        : "unknown";
  }

  async parseDocument(
    uri: string,
    text: string,
    version: number,
  ): Promise<ParsedGraph | JsonldParsedGraph> {
    const cached = this.getSnapshotInternal(uri, true);
    if (cached && cached.version === version) {
      this.tracer?.log("data.cacheHit", {
        uri,
        version,
        snapshots: this.snapshots.size,
        bytes: this.totalSnapshotBytes,
      });
      return cached.parsedGraph;
    }

    const fileType = this.findFileFormat(uri);
    const byteSize = Buffer.byteLength(text, "utf8");
    const parse = async () => {
      try {
        return await this.rdfParser.parse(text, fileType);
      } catch (error: any) {
        this.connection.console.error(
          `[Data Manager]: Error parsing ${uri}: ${error.message}`,
        );
        throw new Error(`Parsing error for ${uri}: ${error.message}`);
      }
    };

    const parsedGraph = await (this.tracer
      ? this.tracer.time("data.parse", parse, {
          uri,
          version,
          fileType,
          bytes: byteSize,
        })
      : parse());

    this.setSnapshot({
      uri,
      version,
      fileType,
      parsedGraph,
      byteSize,
      parsedAt: Date.now(),
    });

    return parsedGraph;
  }

  getSnapshot(uri: string): DocumentSnapshot | undefined {
    const snapshot = this.getSnapshotInternal(uri, true);
    return snapshot ? { ...snapshot } : undefined;
  }

  getAllSnapshots(): DocumentSnapshot[] {
    return Array.from(this.snapshots.values()).map((snapshot) => ({
      ...snapshot,
    }));
  }

  getGraphSnapshot(uri: string): ParsedGraph | JsonldParsedGraph | undefined {
    return this.getSnapshotInternal(uri, true)?.parsedGraph;
  }

  /**
   * Compatibility API. Keep returning a new Map so callers cannot mutate the
   * canonical store. New production code should prefer getSnapshot(s).
   */
  getAllParsedData(): Map<string, CachedParsedGraph> {
    return new Map(
      Array.from(this.snapshots.entries()).map(([uri, snapshot]) => [
        uri,
        snapshotToCachedParsedGraph(snapshot),
      ]),
    );
  }

  removeParsedData(uri: string): void {
    const existing = this.snapshots.get(uri);
    if (existing) {
      this.totalSnapshotBytes -= existing.byteSize ?? 0;
      this.snapshots.delete(uri);
      this.tracer?.log("data.remove", {
        uri,
        snapshots: this.snapshots.size,
        bytes: this.totalSnapshotBytes,
      });
    }
    this.cache.clear(uri);
  }

  /** Compatibility API. Prefer getGraphSnapshot in new code. */
  getParsedData(uri: string): ParsedGraph | JsonldParsedGraph | undefined {
    return this.getSnapshotInternal(uri, true)?.parsedGraph;
  }

  getCachedVersion(uri: string): number | undefined {
    return this.getSnapshotInternal(uri, true)?.version;
  }

  getStats(): DataManagerStats {
    return {
      snapshots: this.snapshots.size,
      totalSnapshotBytes: this.totalSnapshotBytes,
      maxSnapshotEntries: this.maxSnapshotEntries,
      maxSnapshotBytes: this.maxSnapshotBytes,
    };
  }

  private getSnapshotInternal(
    uri: string,
    touch: boolean,
  ): DocumentSnapshot | undefined {
    const snapshot = this.snapshots.get(uri);
    if (!snapshot || !touch) {
      return snapshot;
    }
    // Refresh insertion order for LRU eviction.
    this.snapshots.delete(uri);
    this.snapshots.set(uri, snapshot);
    return snapshot;
  }

  private setSnapshot(snapshot: DocumentSnapshot): void {
    const existing = this.snapshots.get(snapshot.uri);
    if (existing) {
      this.totalSnapshotBytes -= existing.byteSize ?? 0;
      this.snapshots.delete(snapshot.uri);
    }

    this.snapshots.set(snapshot.uri, snapshot);
    this.totalSnapshotBytes += snapshot.byteSize ?? 0;
    this.cache.set(snapshot.uri, snapshotToCachedParsedGraph(snapshot));
    this.enforceSnapshotBudget(snapshot.uri);
  }

  private enforceSnapshotBudget(protectedUri: string): void {
    let evicted = 0;
    let evictedBytes = 0;

    while (
      this.snapshots.size > this.maxSnapshotEntries ||
      (this.totalSnapshotBytes > this.maxSnapshotBytes &&
        this.snapshots.size > 1)
    ) {
      const oldest = this.snapshots.keys().next().value as string | undefined;
      if (!oldest) {
        break;
      }

      if (oldest === protectedUri && this.snapshots.size === 1) {
        break;
      }

      const snapshot = this.snapshots.get(oldest);
      this.snapshots.delete(oldest);
      this.cache.clear(oldest);
      evicted++;
      evictedBytes += snapshot?.byteSize ?? 0;
      this.totalSnapshotBytes -= snapshot?.byteSize ?? 0;
    }

    if (evicted > 0) {
      this.tracer?.log("data.evict", {
        evicted,
        evictedBytes,
        snapshots: this.snapshots.size,
        bytes: this.totalSnapshotBytes,
        maxSnapshotEntries: this.maxSnapshotEntries,
        maxSnapshotBytes: this.maxSnapshotBytes,
      });
    }
  }
}
