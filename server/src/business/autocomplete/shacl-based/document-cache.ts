import { ParsedGraph } from '../../../data/irdf-parser';

export interface CachedDoc {
  lines: string[];
  prefixes: Record<string,string>;
  quads: ParsedGraph['quads'];
  tokensByLine: Map<number, ParsedGraph['tokens']>;
}

export class DocumentCache {
  private cache = new Map<string, CachedDoc>();

  update(uri: string, text: string, parsed: ParsedGraph): void {
    const lines = text.split(/\r?\n/);
    const prefixes = parsed.prefixes || {};
    const quads    = parsed.quads;

    // Build tokensByLine for quick per-line lookup
    const tokensByLine = new Map<number, typeof parsed.tokens>();
    for (const t of parsed.tokens) {
      const ln = text.slice(0, t.startOffset).split(/\r?\n/).length - 1;
      if (!tokensByLine.has(ln)) tokensByLine.set(ln, []);
      tokensByLine.get(ln)!.push(t);
    }

    this.cache.set(uri, { lines, prefixes, quads, tokensByLine });
  }

  get(uri: string): CachedDoc | undefined {
    return this.cache.get(uri);
  }
}
