import {
  Connection,
  Diagnostic,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ValidationManager } from "./validation-manager.js";
import { PerformanceTracer } from "../../utils/performance-trace.js";

export interface ValidationCacheContext {
  configRevision: number;
  shapeRevision: number;
  selectionRevision: number;
}

export interface ValidationSchedulerOptions {
  debounceMs?: number;
  concurrency?: number;
  getContext: () => ValidationCacheContext;
}

interface DiagnosticCacheEntry {
  key: string;
  version: number;
  diagnostics: Diagnostic[];
}

interface ScheduledValidation {
  uri: string;
  reason: string;
}

interface ValidationRunResult {
  uri: string;
  version: number;
  key: string;
  diagnostics: Diagnostic[];
  stale: boolean;
  cacheHit: boolean;
}

const DEFAULT_DEBOUNCE_MS = 75;
const DEFAULT_CONCURRENCY = 2;

/**
 * Coordinates push and pull diagnostics through one cache key and one queue.
 *
 * Cache identity includes document version plus config/SHACL revisions. That
 * keeps diagnostics from surviving settings, SHACL-index, or selection changes.
 * Scheduled push validation is debounced per URI and concurrency-limited so
 * rapid typing or shape-index updates do not start redundant validations.
 */
export class ValidationScheduler {
  private readonly debounceMs: number;
  private readonly concurrency: number;
  private readonly getContext: () => ValidationCacheContext;
  private readonly cache = new Map<string, DiagnosticCacheEntry>();
  private readonly inFlight = new Map<string, Promise<ValidationRunResult>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly queue = new Map<string, ScheduledValidation>();
  private readonly uriRunSequence = new Map<string, number>();
  private active = 0;

  constructor(
    private readonly connection: Connection,
    private readonly documents: TextDocuments<TextDocument>,
    private readonly validationManager: ValidationManager,
    private readonly tracer?: PerformanceTracer,
    options?: ValidationSchedulerOptions,
  ) {
    this.debounceMs = Math.max(0, options?.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    this.concurrency = Math.max(1, options?.concurrency ?? DEFAULT_CONCURRENCY);
    this.getContext = options?.getContext ?? (() => ({
      configRevision: 0,
      shapeRevision: 0,
      selectionRevision: 0,
    }));
  }

  async getDiagnostics(uri: string, reason = "pull"): Promise<Diagnostic[]> {
    const result = await this.compute(uri, reason);
    return result.stale ? [] : result.diagnostics;
  }

  schedule(uri: string, reason: string): void {
    const existing = this.timers.get(uri);
    if (existing) {
      clearTimeout(existing);
    }

    this.timers.set(
      uri,
      setTimeout(() => {
        this.timers.delete(uri);
        this.enqueue(uri, reason);
      }, this.debounceMs),
    );
  }

  scheduleAllOpen(reason: string): void {
    for (const doc of this.documents.all()) {
      this.schedule(doc.uri, reason);
    }
  }

  invalidateUri(uri: string, reason: string): void {
    this.cache.delete(uri);
    this.tracer?.log("validation.cache.invalidateUri", { uri, reason });
  }

  invalidateAll(reason: string): void {
    const entries = this.cache.size;
    this.cache.clear();
    this.tracer?.log("validation.cache.invalidateAll", { reason, entries });
  }

  clearUri(uri: string): void {
    this.cache.delete(uri);
    const timer = this.timers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(uri);
    }
    this.queue.delete(uri);
    this.connection.sendDiagnostics({ uri, diagnostics: [] });
  }

  getStats(): { cached: number; queued: number; active: number; inFlight: number } {
    return {
      cached: this.cache.size,
      queued: this.queue.size,
      active: this.active,
      inFlight: this.inFlight.size,
    };
  }

  private enqueue(uri: string, reason: string): void {
    this.queue.set(uri, { uri, reason });
    this.tracer?.log("validation.queue.enqueue", {
      uri,
      reason,
      queued: this.queue.size,
      active: this.active,
    });
    this.drain();
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.size > 0) {
      const nextKey = this.queue.keys().next().value as string | undefined;
      if (!nextKey) {
        return;
      }
      const task = this.queue.get(nextKey)!;
      this.queue.delete(nextKey);
      this.active++;
      void this.publish(task).finally(() => {
        this.active--;
        this.drain();
      });
    }
  }

  private async publish(task: ScheduledValidation): Promise<void> {
    const result = await this.compute(task.uri, task.reason);
    if (result.stale) {
      this.tracer?.log("validation.publish.stale", {
        uri: task.uri,
        reason: task.reason,
        version: result.version,
      });
      return;
    }

    const doc = this.documents.get(task.uri);
    if (!doc || doc.version !== result.version) {
      this.tracer?.log("validation.publish.skipOutdated", {
        uri: task.uri,
        reason: task.reason,
        resultVersion: result.version,
        latestVersion: doc?.version,
      });
      return;
    }

    this.connection.sendDiagnostics({
      uri: task.uri,
      diagnostics: result.diagnostics,
    });
    this.tracer?.log("validation.publish.sent", {
      uri: task.uri,
      reason: task.reason,
      version: result.version,
      diagnostics: result.diagnostics.length,
      cacheHit: result.cacheHit,
    });
  }

  private async compute(
    uri: string,
    reason: string,
  ): Promise<ValidationRunResult> {
    const doc = this.documents.get(uri);
    if (!doc) {
      return {
        uri,
        version: -1,
        key: "missing",
        diagnostics: [],
        stale: false,
        cacheHit: false,
      };
    }

    const key = this.buildCacheKey(doc.version);
    const cached = this.cache.get(uri);
    if (cached && cached.key === key) {
      this.tracer?.log("validation.cache.hit", {
        uri,
        reason,
        version: doc.version,
      });
      return {
        uri,
        version: cached.version,
        key,
        diagnostics: cached.diagnostics,
        stale: false,
        cacheHit: true,
      };
    }

    const inFlightKey = `${uri}|${key}`;
    const existingRun = this.inFlight.get(inFlightKey);
    if (existingRun) {
      this.tracer?.log("validation.inFlight.join", {
        uri,
        reason,
        version: doc.version,
      });
      return existingRun;
    }

    const run = this.computeUncached(uri, reason, key, doc.version).finally(() => {
      this.inFlight.delete(inFlightKey);
    });
    this.inFlight.set(inFlightKey, run);
    return run;
  }

  private async computeUncached(
    uri: string,
    reason: string,
    key: string,
    requestedVersion: number,
  ): Promise<ValidationRunResult> {
    const sequence = (this.uriRunSequence.get(uri) ?? 0) + 1;
    this.uriRunSequence.set(uri, sequence);

    const rawDiagnostics = await this.timeValidation(uri, reason, requestedVersion);
    const diagnostics = this.dedupeDiagnostics(rawDiagnostics);
    const latest = this.documents.get(uri);
    const latestKey = latest ? this.buildCacheKey(latest.version) : "missing";

    if (
      !latest ||
      latest.version !== requestedVersion ||
      latestKey !== key ||
      this.uriRunSequence.get(uri) !== sequence
    ) {
      this.tracer?.log("validation.compute.stale", {
        uri,
        reason,
        requestedVersion,
        latestVersion: latest?.version,
      });
      return {
        uri,
        version: requestedVersion,
        key,
        diagnostics: [],
        stale: true,
        cacheHit: false,
      };
    }

    this.cache.set(uri, {
      key,
      version: requestedVersion,
      diagnostics,
    });

    return {
      uri,
      version: requestedVersion,
      key,
      diagnostics,
      stale: false,
      cacheHit: false,
    };
  }

  private async timeValidation(
    uri: string,
    reason: string,
    version: number,
  ): Promise<Diagnostic[]> {
    return this.tracer
      ? this.tracer.time(
          "validation.scheduler.compute",
          () => this.validationManager.validate(uri),
          {
            uri,
            reason,
            version,
            ...this.getContext(),
          },
        )
      : this.validationManager.validate(uri);
  }

  private dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const seen = new Set<string>();
    const unique: Diagnostic[] = [];

    for (const diagnostic of diagnostics) {
      const key = this.diagnosticKey(diagnostic);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(diagnostic);
    }

    if (unique.length !== diagnostics.length) {
      this.tracer?.log("validation.diagnostics.deduped", {
        before: diagnostics.length,
        after: unique.length,
      });
    }

    return unique;
  }

  private diagnosticKey(diagnostic: Diagnostic): string {
    const range = diagnostic.range;
    return [
      diagnostic.source ?? "",
      diagnostic.code ?? "",
      diagnostic.severity ?? "",
      diagnostic.message,
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    ].join("|");
  }

  private buildCacheKey(version: number): string {
    const context = this.getContext();
    return [
      version,
      context.configRevision,
      context.shapeRevision,
      context.selectionRevision,
    ].join(":");
  }
}
