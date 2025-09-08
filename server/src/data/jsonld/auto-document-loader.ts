/* eslint-disable @typescript-eslint/no-explicit-any */
import { request, Agent, Dispatcher } from "undici";
import { LRUCache } from "lru-cache";

export interface LoaderOptions {
  headersTimeoutMs?: number;
  bodyTimeoutMs?: number;

  maxCacheEntries?: number;
  cacheTtlMs?: number;
  maxBytes?: number;

  strictSSL?: boolean;
  followRedirects?: number;
  userAgent?: string;
  dispatcher?: Dispatcher;
}

export interface RemoteDocument {
  contextUrl?: string;
  documentUrl: string;
  document: any;
}

type LruKey = string;

let sharedLoader:
  | ((url: string) => Promise<RemoteDocument>)
  | undefined;
let sharedDispose: (() => Promise<void> | void) | undefined;

export function configureSharedDocumentLoader(opts: LoaderOptions = {}) {
  disposeSharedDocumentLoaderSync();
  const { loader, dispose } = createLoader(opts);
  sharedLoader = loader;
  sharedDispose = dispose;
}

export function getSharedDocumentLoader(): (url: string) => Promise<RemoteDocument> {
  if (!sharedLoader) {
    const auto = autoDetectOptionsFromVSCode();
    const { loader, dispose } = createLoader(auto);
    sharedLoader = loader;
    sharedDispose = dispose;
  }
  return sharedLoader!;
}

export async function disposeSharedDocumentLoader() {
  await sharedDispose?.();
  sharedLoader = undefined;
  sharedDispose = undefined;
}


function autoDetectOptionsFromVSCode(): LoaderOptions {
  let strictSSL = true;
  let dispatcher: Dispatcher | undefined;
  let userAgent = "RDFusion-JSONLD/1.1 (+VSCode)";
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const vscode = require("vscode") as typeof import("vscode");
    const http = vscode.workspace.getConfiguration("http");
    strictSSL = http.get<boolean>("proxyStrictSSL", true);
    const proxy = http.get<string>("proxy");
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const u = require("undici");
    if (proxy && typeof u.ProxyAgent === "function") {
      dispatcher = new u.ProxyAgent(proxy);
    } else {
      dispatcher = new u.Agent({ connect: { rejectUnauthorized: strictSSL } });
    }
    userAgent = `RDFusion (+VS Code ${vscode.version})`;
  } catch {
    dispatcher = new Agent({ connect: { rejectUnauthorized: true } });
  }
  return { strictSSL, dispatcher, userAgent };
}

function createLoader(opts: LoaderOptions) {
  const {
    headersTimeoutMs = 7_000,
    bodyTimeoutMs = 20_000,
    strictSSL = true,
    followRedirects = 5,
    userAgent = "RDFusion-JSONLD/1.1 (+VSCode)",
    maxCacheEntries = 256,
    cacheTtlMs = 60 * 60 * 1000,
    maxBytes = 5 * 1024 * 1024,
    dispatcher = new Agent({ connect: { rejectUnauthorized: strictSSL } }),
  } = opts;

  const cache = new LRUCache<LruKey, RemoteDocument>({
    max: maxCacheEntries,
    ttl: cacheTtlMs,
    updateAgeOnGet: true,
    ttlAutopurge: true,
  });

  const ACCEPT = 'application/ld+json, application/json;q=0.9, */*;q=0.1';
  const JSONLD_REL = "http://www.w3.org/ns/json-ld#context";

  function parseLinkHeader(link: string | null): Record<string, { target: string; [k: string]: string }> {
    const out: Record<string, any> = {};
    if (!link) return out;
    const parts = link.match(/(?:<[^>]*?>|"[^"]*?"|[^,])+/g) || [];
    for (const part of parts) {
      const m = part.match(/\s*<([^>]*?)>\s*(?:;\s*(.*))?/);
      if (!m) continue;
      const target = m[1];
      const params = m[2] || "";
      let rel = "";
      for (const kv of params.split(/\s*;\s*/)) {
        if (!kv) continue;
        const mm = kv.match(/(.*?)=(?:(?:"([^"]*?)")|([^"]*?))$/);
        if (!mm) continue;
        const k = mm[1].toLowerCase();
        const v = (mm[2] ?? mm[3] ?? "").trim();
        if (k === "rel") rel = v;
        out[rel] ??= { target };
        out[rel][k] = v;
      }
    }
    return out;
  }

  async function fetchOnce(url: string, redirectsLeft: number): Promise<RemoteDocument> {
    const res = await request(url, {
      method: "GET",
      dispatcher,
      headersTimeout: headersTimeoutMs,
      bodyTimeout: bodyTimeoutMs,
      headers: { accept: ACCEPT, "user-agent": userAgent },
      maxRedirections: 0,
    });

    if (res.statusCode >= 300 && res.statusCode < 400) {
      const loc = res.headers.location as string | undefined;
      if (!loc) throw new Error(`Redirect without Location from ${url}`);
      if (redirectsLeft <= 0) throw new Error(`Too many redirects fetching ${url}`);
      const next = new URL(loc, url).toString();
      res.body.resume();
      return fetchOnce(next, redirectsLeft - 1);
    }

    if (res.statusCode >= 400) {
      let hint = "";
      try {
        const ab = await res.body.arrayBuffer();
        hint = Buffer.from(ab).toString("utf8").slice(0, 512);
      } catch { /*  */ }
      throw new Error(`HTTP ${res.statusCode} fetching ${url}${hint ? `: ${hint}` : ""}`);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as any as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > maxBytes) {
        res.body.destroy();
        throw new Error(`Context exceeds max size (${maxBytes}B): ${url}`);
      }
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    const text = buf.toString("utf8");

    const ctype = String(res.headers["content-type"] ?? "");
    if (/html/i.test(ctype) || /^\s*</.test(text)) {
      throw new Error(`Unexpected HTML from ${url}`);
    }

    let document: any;
    try { document = text ? JSON.parse(text) : null; }
    catch { document = text; }

    const link = parseLinkHeader((res.headers.link as string | undefined) ?? null);
    const contextUrl = link[JSONLD_REL]?.target
      ? new URL(link[JSONLD_REL].target, url).toString()
      : undefined;

    return { contextUrl, documentUrl: url, document };
  }

  async function loader(url: string): Promise<RemoteDocument> {
    const key = url as LruKey;
    const cached = cache.get(key);
    if (cached) return cached;

    let lastErr: unknown;
    for (let i = 0; i < 2; i++) {
      try {
        const doc = await fetchOnce(url, followRedirects);
        cache.set(key, doc);
        return doc;
      } catch (err) {
        lastErr = err;
        if (i === 0) {
          const backoff = 250 + Math.random() * 200;
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    throw lastErr ?? new Error(`Failed to load JSON-LD document: ${url}`);
  }

  const dispose = async () => {
    try { await (dispatcher as any).close?.(); } catch { /*  */ }
  };

  return { loader, dispose };
}

function disposeSharedDocumentLoaderSync() {
  try { void sharedDispose?.(); } catch { /*  */ }
  sharedLoader = undefined;
  sharedDispose = undefined;
}
