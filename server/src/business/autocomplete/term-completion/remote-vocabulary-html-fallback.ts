import fetch from "node-fetch";
import {
  OWL_ANNOTATION_PROPERTY,
  OWL_CLASS,
  OWL_DATATYPE_PROPERTY,
  OWL_OBJECT_PROPERTY,
  RDF_PROPERTY,
  RDFS_CLASS,
} from "../../../data/rdf/rdf-vocabulary";
import {
  createMutableVocabularyInfo,
  freezeVocabularyInfo,
  type LocalTermVocabularyInfo,
  type MutableVocabularyInfo,
} from "../term-metadata/vocabulary-info";
import type { RemoteVocabularyPrefixResolver } from "./remote-vocabulary-parser";
import { withTimeout } from "./remote-vocabulary-fetcher";

interface HtmlFallbackOptions {
  term: string;
  termIri: string;
  timeoutMs: number;
}

type FieldKey =
  | "uri"
  | "label"
  | "comment"
  | "note"
  | "status"
  | "type"
  | "domain"
  | "range"
  | "subClassOf"
  | "subPropertyOf"
  | "equivalentTerms"
  | "inverseOf"
  | "seeAlso"
  | "isDefinedBy"
  | "versionInfo";

const FIELD_ALIASES: Record<FieldKey, readonly string[]> = {
  uri: ["URI", "IRI", "URL", "identifier"],
  label: [
    "label",
    "pref label",
    "preferred label",
    "preferredLabel",
    "prefLabel",
    "alt label",
    "alternative label",
    "altLabel",
    "hidden label",
    "hiddenLabel",
    "title",
    "name",
  ],
  comment: ["definition", "description", "comment"],
  note: [
    "usage",
    "note",
    "scope note",
    "scopeNote",
    "history note",
    "historyNote",
    "editorial note",
    "editorialNote",
    "change note",
    "changeNote",
  ],
  status: ["status", "term status", "term_status", "deprecated"],
  type: ["type", "rdf type", "rdf:type", "kind"],
  domain: ["domain"],
  range: ["range"],
  subClassOf: ["sub class of", "subclass of", "subClassOf", "superclass"],
  subPropertyOf: [
    "sub property of",
    "subproperty of",
    "subPropertyOf",
    "superproperty",
  ],
  equivalentTerms: [
    "equivalent class",
    "equivalent property",
    "equivalent term",
    "equivalentClass",
    "equivalentProperty",
    "same as",
    "sameAs",
  ],
  inverseOf: ["inverse", "inverse of", "inverse property", "inverseOf"],
  seeAlso: [
    "see also",
    "seeAlso",
    "related",
    "imports",
    "owl:imports",
    "version IRI",
    "versionIRI",
    "property disjoint with",
    "propertyDisjointWith",
  ],
  isDefinedBy: ["is defined by", "defined by", "isDefinedBy"],
  versionInfo: ["version info", "versionInfo"],
};

const ALL_FIELD_NAMES = Object.values(FIELD_ALIASES)
  .flat()
  .sort((a, b) => b.length - a.length);

const TYPE_KEYWORDS = new Map<string, string>([
  ["class", RDFS_CLASS],
  ["rdfs:class", RDFS_CLASS],
  ["owl:class", OWL_CLASS],
  ["property", RDF_PROPERTY],
  ["rdf property", RDF_PROPERTY],
  ["rdf:property", RDF_PROPERTY],
  ["object property", OWL_OBJECT_PROPERTY],
  ["objectproperty", OWL_OBJECT_PROPERTY],
  ["owl:objectproperty", OWL_OBJECT_PROPERTY],
  ["datatype property", OWL_DATATYPE_PROPERTY],
  ["dataproperty", OWL_DATATYPE_PROPERTY],
  ["owl:datatypeproperty", OWL_DATATYPE_PROPERTY],
  ["annotation property", OWL_ANNOTATION_PROPERTY],
  ["annotationproperty", OWL_ANNOTATION_PROPERTY],
  ["owl:annotationproperty", OWL_ANNOTATION_PROPERTY],
]);

function decodeEntity(entity: string): string {
  if (entity.startsWith("#x")) {
    const code = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
  }
  if (entity.startsWith("#")) {
    const code = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${entity};`;
  }
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return named[entity] ?? `&${entity};`;
}

function htmlToLines(html: string): string[] {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/td|\/th|\/dt|\/dd|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-zA-Z]+|#\d+|#x[\da-fA-F]+);/g, (_, entity: string) =>
      decodeEntity(entity),
    );

  return text
    .split(/\r?\n/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startsField(line: string, field: string): string | undefined {
  const match = line.match(new RegExp(`^${escapeRegExp(field)}\\b[:\\s]*(.*)$`, "i"));
  return match ? match[1].trim() : undefined;
}

function directFieldValues(block: string[], field: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < block.length; i++) {
    const rest = startsField(block[i], field);
    if (rest !== undefined) {
      out.push(rest || block[i + 1] || "");
      continue;
    }
    if (new RegExp(`^${escapeRegExp(field)}$`, "i").test(block[i])) {
      out.push(block[i + 1] || "");
    }
  }
  return out.map(normalizeSpaces).filter(Boolean);
}

function inlineFieldValues(block: string[], field: string): string[] {
  const text = normalizeSpaces(block.join(" "));
  const otherFields = ALL_FIELD_NAMES
    .filter((name) => name.toLowerCase() !== field.toLowerCase())
    .map(escapeRegExp)
    .join("|");
  const regex = new RegExp(
    `(?:^|\\s)${escapeRegExp(field)}\\b[:\\s]+(.+?)(?=\\s+(?:${otherFields})\\b[:\\s]*|$)`,
    "gi",
  );
  const out: string[] = [];
  for (const match of text.matchAll(regex)) {
    if (match[1]) out.push(normalizeSpaces(match[1]));
  }
  return out;
}

function metadataFieldValues(block: string[], key: FieldKey): string[] {
  const values = new Set<string>();
  for (const field of FIELD_ALIASES[key]) {
    for (const value of directFieldValues(block, field)) values.add(value);
    for (const value of inlineFieldValues(block, field)) values.add(value);
  }
  return Array.from(values).filter(Boolean);
}

function allIris(value: string): string[] {
  return Array.from(value.matchAll(/https?:\/\/[^\s<>)\]}",;]+/g))
    .map((match) => match[0].replace(/[),.;]+$/, ""))
    .filter(Boolean);
}

function splitStructuredValues(value: string): string[] {
  const iriMatches = allIris(value);
  if (iriMatches.length) return iriMatches;

  return value
    .split(/[,;|]/)
    .map((part) => normalizeSpaces(part))
    .filter(Boolean);
}

function normalizeTypeKeyword(value: string): string | undefined {
  const normalized = normalizeSpaces(value)
    .replace(/`/g, "")
    .toLowerCase();
  return TYPE_KEYWORDS.get(normalized);
}

function addTextValues(target: Set<string>, values: string[]): void {
  for (const value of values) {
    const clean = normalizeSpaces(value);
    if (clean) target.add(clean);
  }
}

export class RemoteVocabularyHtmlFallback {
  constructor(
    private readonly prefixResolver: RemoteVocabularyPrefixResolver,
  ) {}

  async fetchTerm(
    options: HtmlFallbackOptions,
  ): Promise<LocalTermVocabularyInfo | undefined> {
    const html = await this.fetchHtml(options.termIri, options.timeoutMs);
    return this.parseTerm(html, options.term, options.termIri);
  }

  parseTerm(
    html: string,
    term: string,
    termIri: string,
  ): LocalTermVocabularyInfo | undefined {
    const lines = htmlToLines(html);
    const iriIndexes = lines
      .map((line, index) => (line.includes(termIri) ? index : -1))
      .filter((index) => index >= 0);
    if (!iriIndexes.length) return undefined;

    const uriIndex =
      iriIndexes.find((index) =>
        FIELD_ALIASES.uri.some((field) =>
          startsField(lines[index], field) !== undefined ||
          new RegExp(`^${escapeRegExp(field)}$`, "i").test(lines[index - 1] ?? ""),
        ),
      ) ??
      iriIndexes.find((index) => {
        const lookahead = lines.slice(index, Math.min(lines.length, index + 24));
        return ["label", "comment", "domain", "range", "type"].some((key) =>
          metadataFieldValues(lookahead, key as FieldKey).length > 0,
        );
      }) ??
      iriIndexes[0];

    const base = termIri.slice(0, termIri.length - term.length);
    let end = lines.length;
    for (let i = uriIndex + 1; i < lines.length; i++) {
      if (
        lines[i].includes(base) &&
        FIELD_ALIASES.uri.some((field) =>
          lines[i].includes(field) || /^URI$/i.test(lines[i - 1] ?? ""),
        ) &&
        !lines[i].includes(termIri)
      ) {
        end = i;
        break;
      }
    }

    const block = lines.slice(Math.max(0, uriIndex - 6), end);
    const info = createMutableVocabularyInfo(termIri);

    addTextValues(info.labels, metadataFieldValues(block, "label"));
    addTextValues(info.comments, metadataFieldValues(block, "comment"));
    addTextValues(info.notes, metadataFieldValues(block, "note"));
    addTextValues(info.status, metadataFieldValues(block, "status"));
    this.addStandaloneKind(block, info);

    this.addStructuredValues(info.domains, metadataFieldValues(block, "domain"));
    this.addStructuredValues(info.ranges, metadataFieldValues(block, "range"));
    this.addStructuredValues(info.subClassOf, metadataFieldValues(block, "subClassOf"));
    this.addStructuredValues(info.subPropertyOf, metadataFieldValues(block, "subPropertyOf"));
    this.addStructuredValues(info.equivalentTerms, metadataFieldValues(block, "equivalentTerms"));
    this.addStructuredValues(info.inverseOf, metadataFieldValues(block, "inverseOf"));
    this.addStructuredValues(info.seeAlso, metadataFieldValues(block, "seeAlso"));
    this.addStructuredValues(info.isDefinedBy, metadataFieldValues(block, "isDefinedBy"));

    for (const version of metadataFieldValues(block, "versionInfo")) {
      info.notes.add(`Version: ${version}`);
    }

    this.addTypesAndRoles(info, metadataFieldValues(block, "type"));

    if (!hasUsefulMetadata(info)) return undefined;
    return freezeVocabularyInfo(info);
  }

  private async fetchHtml(url: string, timeoutMs: number): Promise<string> {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          accept: "text/html, application/xhtml+xml, */*;q=0.1",
          "user-agent": "RDFusion remote vocabulary metadata (+VSCode)",
        },
      }),
      timeoutMs,
      `Fetching HTML vocabulary metadata ${url}`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    return await response.text();
  }

  private addStructuredValues(target: Set<string>, values: string[]): void {
    for (const value of values) {
      for (const part of splitStructuredValues(value)) {
        target.add(this.formatIri(part));
      }
    }
  }

  private addStandaloneKind(block: string[], info: MutableVocabularyInfo): void {
    for (const line of block) {
      const type = normalizeTypeKeyword(line);
      if (!type) continue;
      this.addTypesAndRoles(info, [type]);
    }
  }

  private addTypesAndRoles(info: MutableVocabularyInfo, values: string[]): void {
    for (const value of values) {
      const parts = splitStructuredValues(value);
      for (const part of parts.length ? parts : [value]) {
        const explicitType = normalizeTypeKeyword(part) ?? part;
        const formatted = this.formatIri(explicitType);
        info.types.add(formatted);
        if ([RDFS_CLASS, OWL_CLASS, "rdfs:Class", "owl:Class"].includes(formatted)) {
          info.roles.add("class");
        }
        if (
          [
            RDF_PROPERTY,
            OWL_OBJECT_PROPERTY,
            OWL_DATATYPE_PROPERTY,
            OWL_ANNOTATION_PROPERTY,
            "rdf:Property",
            "owl:ObjectProperty",
            "owl:DatatypeProperty",
            "owl:AnnotationProperty",
          ].includes(formatted)
        ) {
          info.roles.add("property");
          info.roles.add("predicate");
        }
      }
    }
  }

  private formatIri(iri: string): string {
    const knownPrefix = this.prefixResolver.getPrefix(iri);
    const knownBase = knownPrefix
      ? this.prefixResolver.getIri(knownPrefix)
      : undefined;
    if (knownPrefix && knownBase && iri.startsWith(knownBase)) {
      const term = iri.slice(knownBase.length);
      return term ? `${knownPrefix}:${term}` : iri;
    }
    return iri;
  }
}

function hasUsefulMetadata(info: MutableVocabularyInfo): boolean {
  return Boolean(
    info.labels.size ||
      info.comments.size ||
      info.notes.size ||
      info.status.size ||
      info.types.size ||
      info.domains.size ||
      info.ranges.size ||
      info.subClassOf.size ||
      info.subPropertyOf.size ||
      info.equivalentTerms.size ||
      info.inverseOf.size ||
      info.seeAlso.size ||
      info.isDefinedBy.size ||
      info.roles.size,
  );
}
