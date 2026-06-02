import type { Connection } from "vscode-languageserver/node.js";

export interface PerformanceTraceSettings {
  performance?: {
    trace?: boolean;
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDetails(details?: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }
  return (
    " " +
    Object.entries(details)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ")
  );
}

export class PerformanceTracer {
  private enabled = false;

  constructor(
    private readonly connection: Connection,
    private readonly prefix = "RDFusion Performance",
  ) {}

  updateSettings(settings: PerformanceTraceSettings | unknown): void {
    const value =
      settings && typeof settings === "object"
        ? (settings as PerformanceTraceSettings)
        : undefined;
    this.enabled = Boolean(value?.performance?.trace);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  log(event: string, details?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    this.connection.console.log(
      `[${this.prefix}] ${event}${formatDetails(details)}`,
    );
  }

  async time<T>(
    event: string,
    fn: () => Promise<T>,
    details?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }
    const started = Date.now();
    try {
      const result = await fn();
      this.log(`${event}.done`, { ...details, ms: Date.now() - started });
      return result;
    } catch (error: unknown) {
      this.log(`${event}.failed`, {
        ...details,
        ms: Date.now() - started,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  timeSync<T>(
    event: string,
    fn: () => T,
    details?: Record<string, unknown>,
  ): T {
    if (!this.enabled) {
      return fn();
    }
    const started = Date.now();
    try {
      const result = fn();
      this.log(`${event}.done`, { ...details, ms: Date.now() - started });
      return result;
    } catch (error: unknown) {
      this.log(`${event}.failed`, {
        ...details,
        ms: Date.now() - started,
        error: errorMessage(error),
      });
      throw error;
    }
  }
}
