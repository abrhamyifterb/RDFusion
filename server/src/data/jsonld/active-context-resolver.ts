/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSharedDocumentLoader, RemoteDocument } from './auto-document-loader';

export interface TermDef {
  "@id"?: string | null;
  "@type"?: string;
  "@container"?: string[];
  "@language"?: string | null;
  "@direction"?: "ltr" | "rtl" | null;
  "@reverse"?: boolean;
  "@index"?: string;
  "@context"?: any;
  "@protected"?: boolean;
  "@prefix"?: boolean;
}

export interface ResolvedContext {
  terms: Map<string, TermDef>;
  vocab?: string;
  base?: string | null;
  language?: string | null;
  direction?: "ltr" | "rtl" | null;
}

export class ActiveContextResolver {
  constructor(
    private loader: (url: string) => Promise<RemoteDocument> = getSharedDocumentLoader()
  ) {}

  async resolveForDocument(doc: any, base?: string): Promise<ResolvedContext> {
    const ctx = doc && typeof doc === "object" ? doc["@context"] : undefined;
    return this.resolveContextValue(ctx, base);
  }

  async resolveContextValue(value: any, base?: string, seen = new Set<string>()): Promise<ResolvedContext> {
    const acc: ResolvedContext = { terms: new Map(), base: base ?? undefined };

    const merge = (into: ResolvedContext, from: ResolvedContext) => {
      if (from.vocab !== undefined) into.vocab = from.vocab;
      if (from.base !== undefined) into.base = from.base;
      if (from.language !== undefined) into.language = from.language;
      if (from.direction !== undefined) into.direction = from.direction;
      for (const [k, v] of from.terms) into.terms.set(k, v);
      return into;
    };

    if (value == null) return acc;

    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (typeof item === "string") {
        const remote = await this.loadRemoteContext(item, seen);
        const inner = remote.document && typeof remote.document === "object"
          ? (remote.document["@context"] ?? remote.document)
          : undefined;

        if (remote.contextUrl && !inner) {
          const linked = await this.loadRemoteContext(remote.contextUrl, seen);
          const linkedCtx = linked.document && (linked.document["@context"] ?? linked.document);
          merge(acc, await this.resolveContextValue(linkedCtx, absolutize(remote.contextUrl, item), seen));
          continue;
        }

        merge(acc, await this.resolveContextValue(inner, item, seen));
      } else if (item && typeof item === "object") {
        if (typeof item["@import"] === "string") {
          merge(acc, await this.resolveContextValue(item["@import"], base, seen));
        }

        if (item["@base"] === null) acc.base = null;
        else if (typeof item["@base"] === "string") acc.base = absolutize(item["@base"], base);

        if (item["@vocab"] === null) acc.vocab = undefined;
        else if (typeof item["@vocab"] === "string") acc.vocab = absolutize(item["@vocab"], base);

        if (item["@language"] === null) acc.language = null;
        else if (typeof item["@language"] === "string") acc.language = item["@language"].toLowerCase();

        if (item["@direction"] === null) acc.direction = null;
        else if (item["@direction"] === "ltr" || item["@direction"] === "rtl") acc.direction = item["@direction"];

        for (const [term, raw] of Object.entries(item)) {
          if (term.startsWith("@")) continue;
          const def = normalizeTermDef(term, raw, acc, base);
          if (def) acc.terms.set(term, def);
        }
      }
    }

    return acc;
  }

  private async loadRemoteContext(url: string, seen: Set<string>) {
    const abs = absolutize(url);
    if (seen.has(abs)) throw new Error(`Cyclic @context detected at ${abs}`);
    seen.add(abs);
    return this.loader(abs);
  }
}


function absolutize(iri: string, base?: string | null): string {
  try { return new URL(iri, base ?? undefined).toString(); }
  catch { return iri; }
}

function expandIri(value: string, ac: ResolvedContext, { vocab }: { vocab: boolean }, base?: string | null) {
  if (value.startsWith("@")) return value;
  const colon = value.indexOf(":");
  if (colon > 0) {
    const pfx = value.slice(0, colon);
    const prefixDef = ac.terms.get(pfx);
    if (prefixDef?.["@id"] && prefixDef["@prefix"]) return prefixDef["@id"] + value.slice(colon + 1);
    try { return new URL(value).toString(); } catch { /* */ }
  }
  if (vocab && ac.vocab) return ac.vocab + value;
  return absolutize(value, base ?? ac.base ?? undefined);
}
function arr<T>(v: T | T[] | undefined): T[] | undefined { return v === undefined ? undefined : (Array.isArray(v) ? v : [v]); }
function normalizeTermDef(term: string, raw: any, ac: ResolvedContext, base?: string | null): TermDef | null {
  if (raw == null) return { "@id": null };
  if (typeof raw === "string") return { "@id": expandIri(raw, ac, { vocab: true }, base) };
  if (typeof raw !== "object") return null;

  let id: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(raw, "@id")) {
    id = raw["@id"] == null ? null : expandIri(String(raw["@id"]), ac, { vocab: true }, base);
  }
  const container = arr<string>(raw["@container"])?.slice().sort();

  let dtype: string | undefined;
  if (Object.prototype.hasOwnProperty.call(raw, "@type")) {
    const t = raw["@type"];
    if (t === "@id" || t === "@vocab" || t === "@json" || t === "@none") dtype = t;
    else dtype = expandIri(String(t), ac, { vocab: true }, base);
  }

  const lang = Object.prototype.hasOwnProperty.call(raw, "@language")
    ? (raw["@language"] == null ? null : String(raw["@language"]).toLowerCase())
    : undefined;

  const dir = Object.prototype.hasOwnProperty.call(raw, "@direction")
    ? (raw["@direction"] == null ? null : (raw["@direction"] === "rtl" ? "rtl" : "ltr"))
    : undefined;

  return {
    "@id": id, "@type": dtype, "@container": container, "@language": lang, "@direction": dir,
    "@index": typeof raw["@index"] === "string" ? raw["@index"] : undefined,
    "@reverse": raw["@reverse"] === true, "@context": raw["@context"],
    "@protected": raw["@protected"] === true, "@prefix": raw["@prefix"] === true
  };
}

const store = new WeakMap<object, ResolvedContext>();
export function setResolvedContext(key: object, ctx: ResolvedContext | undefined) {
  if (ctx) store.set(key, ctx); else store.delete(key);
}
export function getResolvedContext(key: object): ResolvedContext | undefined { return store.get(key); }
