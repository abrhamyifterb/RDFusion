import {
  CompletionItem,
  MarkupContent,
  MarkupKind,
} from "vscode-languageserver/node.js";
import type { PrefixRegistry } from "../prefix/prefix-registry.js";
import type { TermProvider } from "../term-completion/term-provider.js";
import {
  mergeVocabularyInfos,
  type LocalTermVocabularyInfo,
} from "./vocabulary-info";
import type { RemoteTermInfo } from "../term-completion/remote-term-cache.js";
import type {
  ShapeManager,
  ShapePropertyMetadata,
} from "../../../data/shacl/shape-manager.js";
import type { ShaclSelectionSettings } from "../../../data/shacl/shacl-selection.js";

export type TermMetadataSource =
  | "prefix"
  | "local"
  | "shacl"
  | "remote"
  | "context"
  | "vocabulary";

export interface TermMetadata {
  prefix: string;
  term: string;
  curie: string;
  iri?: string;
  sources: TermMetadataSource[];
  detail: string;
  documentation?: string;
  vocabulary?: LocalTermVocabularyInfo;
  local?: {
    sourceUris: string[];
    documentCount: number;
    vocabulary?: LocalTermVocabularyInfo;
  };
  remote?: RemoteTermInfo;
  shaclProperties?: ShapePropertyMetadata[];
  contextRole?: CompletionMetadataOptions["role"];
}

export interface CompletionMetadataOptions {
  source?: TermMetadataSource;
  role?: "subject" | "predicate" | "object" | "unknown";
  namespaceIri?: string;
  syntax?: "turtle" | "jsonld";
  shaclSelection?: ShaclSelectionSettings;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sourceLabel(source: TermMetadataSource): string {
  switch (source) {
    case "prefix":
      return "known prefix";
    case "local":
      return "workspace vocabulary";
    case "vocabulary":
      return "vocabulary metadata";
    case "shacl":
      return "selected SHACL property";
    case "remote":
      return "remote vocabulary";
    case "context":
      return "context term";
    default:
      return source;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1");
}

function code(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function isHttpIri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function linkOrCode(value: string): string {
  if (!isHttpIri(value)) {
    return code(value);
  }
  const target = value.replace(/\)/g, "%29");
  return `[${escapeMarkdown(value)}](${target})`;
}

function listInline(
  values: string[] | undefined,
  limit = 5,
): string | undefined {
  if (!values?.length) return undefined;
  const shown = values
    .slice(0, limit)
    .map(linkOrCode)
    .join(", ");
  const more = values.length > limit ? `, +${values.length - limit} more` : "";
  return `${shown}${more}`;
}

function pushField(
  lines: string[],
  label: string,
  values: string[] | undefined,
  limit = 5,
): void {
  const rendered = listInline(values, limit);
  if (rendered) {
    lines.push(`- **${label}:** ${rendered}`);
  }
}

function displayName(prefix: string, term: string): string {
  return prefix === "@vocab" ? term : `${prefix}:${term}`;
}

function bestLabel(metadata: TermMetadata): string {
  const labels = metadata.vocabulary?.labels ?? [];
  return labels[0] ?? metadata.curie;
}

function roleSummary(vocabulary?: LocalTermVocabularyInfo): string | undefined {
  if (!vocabulary) return undefined;
  const roles = vocabulary.roles.filter(
    (role) => role !== "subject" && role !== "object",
  );
  return roles.length ? roles.join(", ") : undefined;
}

/**
 * Central source of term metadata shared by hover and completion detail.
 *
 * This intentionally consumes existing indexes/caches. Completion can populate
 * remote dereference metadata through RemoteTermCache; hover reads cached remote
 * metadata immediately and may optionally wait briefly for a first dereference.
 */
export class TermMetadataService {
  constructor(
    private readonly prefixRegistry: PrefixRegistry,
    private readonly termProvider?: TermProvider,
    private readonly shapeManager?: ShapeManager,
    private readonly getShaclSelection?: () => ShaclSelectionSettings,
  ) {}

  getCurieMetadata(
    curie: string,
    options: CompletionMetadataOptions = {},
  ): TermMetadata | undefined {
    const [prefix, term] = curie.split(":", 2);
    if (!prefix || !term) {
      return undefined;
    }
    return this.getMetadata(prefix, term, options);
  }

  async getCurieMetadataAsync(
    curie: string,
    options: CompletionMetadataOptions = {},
  ): Promise<TermMetadata | undefined> {
    const [prefix, term] = curie.split(":", 2);
    if (!prefix || !term) {
      return undefined;
    }
    return this.getMetadataAsync(prefix, term, options);
  }

  async getMetadataAsync(
    prefix: string,
    term: string,
    options: CompletionMetadataOptions = {},
  ): Promise<TermMetadata | undefined> {
    const cached = this.getMetadata(prefix, term, options);
    if (
      cached?.remote ||
      !this.termProvider ||
      !("ensureRemoteTermInfo" in this.termProvider)
    ) {
      return cached;
    }

    await this.termProvider
      .ensureRemoteTermInfo(prefix, term, options.namespaceIri, options.syntax)
      .catch(() => undefined);
    return this.getMetadata(prefix, term, options) ?? cached;
  }

  getMetadata(
    prefix: string,
    term: string,
    options: CompletionMetadataOptions = {},
  ): TermMetadata | undefined {
    if (!prefix || !term) {
      return undefined;
    }

    const iriBase =
      options.namespaceIri ??
      (prefix === "@vocab" ? undefined : this.prefixRegistry.getIri(prefix));
    const iri = iriBase ? `${iriBase}${term}` : undefined;
    const remote =
      this.termProvider && "getRemoteTermInfo" in this.termProvider
        ? this.termProvider.getRemoteTermInfo(
            prefix,
            term,
            options.namespaceIri,
            options.syntax,
          )
        : undefined;
    const vocabulary = mergeVocabularyInfos(remote?.vocabulary);
    const shaclSelection = options.shaclSelection ?? this.getShaclSelection?.();
    const shaclProperties = iri
      ? (this.shapeManager?.getPropertyMetadataForIri(iri, shaclSelection) ??
        [])
      : [];
    const hasVocabulary = !!vocabulary;

    const sources = uniq([
      ...(iriBase ? ["prefix" as const] : []),
      ...(remote ? ["remote" as const] : []),
      ...(hasVocabulary ? ["vocabulary" as const] : []),
      ...(shaclProperties.length > 0 ? ["shacl" as const] : []),
      ...(options.source ? [options.source] : []),
    ]);

    const hasUsefulMetadata = !!remote || shaclProperties.length > 0;
    if (!hasUsefulMetadata) {
      return undefined;
    }

    const curie = displayName(prefix, term);
    const vocabularyRole = roleSummary(vocabulary);
    const label = vocabulary?.labels?.[0];
    const detailParts = [
      label && label !== curie ? `${curie} — ${label}` : curie,
      vocabularyRole ? vocabularyRole : undefined,
      vocabulary?.domains?.length
        ? `domain ${vocabulary.domains.slice(0, 2).join(", ")}`
        : undefined,
      vocabulary?.ranges?.length
        ? `range ${vocabulary.ranges.slice(0, 2).join(", ")}`
        : undefined,
      shaclProperties.length ? `SHACL guidance available` : undefined,
    ].filter(Boolean);

    const metadata: TermMetadata = {
      prefix,
      term,
      curie,
      iri: vocabulary?.iri ?? iri,
      sources,
      detail: detailParts.join(" "),
      vocabulary,
      local: undefined,
      remote,
      shaclProperties,
      contextRole: options.role,
    };
    metadata.documentation = this.toMarkdown(metadata);
    return metadata;
  }

  enrichCompletionItem(
    item: CompletionItem,
    prefix: string,
    term: string,
    options: CompletionMetadataOptions = {},
  ): CompletionItem {
    const metadata = this.getMetadata(prefix, term, options);
    if (!metadata) {
      return item;
    }

    item.detail = metadata.detail;
    item.documentation = this.toMarkupContent(metadata);
    item.data = {
      ...(typeof item.data === "object" && item.data
        ? (item.data as Record<string, unknown>)
        : {}),
      rdfusionTerm: {
        prefix: metadata.prefix,
        term: metadata.term,
        curie: metadata.curie,
        iri: metadata.iri,
        sources: metadata.sources,
        role: options.role,
      },
    };
    return item;
  }

  toMarkupContent(metadata: TermMetadata): MarkupContent {
    return {
      kind: MarkupKind.Markdown,
      value: metadata.documentation ?? this.toMarkdown(metadata),
    };
  }

  private toMarkdown(metadata: TermMetadata): string {
    const vocabulary = metadata.vocabulary;
    const title = bestLabel(metadata);
    const lines = [`**${escapeMarkdown(title)}**`];

    const summary: string[] = [];
    if (title !== metadata.curie) {
      summary.push(`- **Term:** ${code(metadata.curie)}`);
    }

    if (metadata.iri) {
      summary.push(`- **IRI:** ${linkOrCode(metadata.iri)}`);
    }

    const role = roleSummary(vocabulary);
    if (role) {
      summary.push(`- **Kind:** ${escapeMarkdown(role)}`);
    }

    const status = listInline(vocabulary?.status, 3);
    if (status) {
      summary.push(`- **Status:** ${status}`);
    }

    const usefulSources = metadata.sources.filter(
      (source) => source === "remote" || source === "shacl",
    );
    if (usefulSources.length > 0) {
      summary.push(
        `- **Metadata source:** ${usefulSources.map(sourceLabel).join(", ")}`,
      );
    }

    if (summary.length) {
      lines.push("", ...summary);
    }

    if (vocabulary?.comments.length) {
      lines.push("", "**Description**");
      for (const comment of vocabulary.comments.slice(0, 2)) {
        lines.push(`- ${comment}`);
      }
    }

    if (vocabulary?.notes.length) {
      lines.push("", "**Notes**");
      for (const note of vocabulary.notes.slice(0, 2)) {
        lines.push(`- ${note}`);
      }
    }

    const details: string[] = [];
    pushField(details, "Types", vocabulary?.types, 6);
    pushField(details, "Domain", vocabulary?.domains, 6);
    pushField(details, "Range", vocabulary?.ranges, 6);
    pushField(details, "Subclass of", vocabulary?.subClassOf, 4);
    pushField(details, "Subproperty of", vocabulary?.subPropertyOf, 4);
    pushField(details, "Equivalent to", vocabulary?.equivalentTerms, 4);
    pushField(details, "Inverse of", vocabulary?.inverseOf, 4);
    if (details.length) {
      lines.push("", "**Vocabulary details**", ...details);
    }

    if (vocabulary?.examples.length) {
      lines.push("", "**Examples**");
      for (const example of vocabulary.examples.slice(0, 3)) {
        lines.push(`- ${example}`);
      }
      if (vocabulary.examples.length > 3) {
        lines.push(`- +${vocabulary.examples.length - 3} more`);
      }
    }

    if (metadata.shaclProperties?.length) {
      lines.push("", "**SHACL guidance**");
      for (const prop of metadata.shaclProperties.slice(0, 5)) {
        const shape = prop.shapeName ?? prop.shapeLabel ?? prop.shapeId;
        const summaryText =
          prop.summary && prop.summary !== prop.pathDisplay
            ? ` — ${prop.summary}`
            : "";
        lines.push(`- **${escapeMarkdown(prop.label)}** in ${code(shape)}${summaryText}`);
        if (prop.targetDisplays.length) {
          lines.push(
            `  - Targets: ${prop.targetDisplays.slice(0, 3).map(code).join(", ")}`,
          );
        }
      }
      if (metadata.shaclProperties.length > 5) {
        lines.push(
          `- +${metadata.shaclProperties.length - 5} additional selected SHACL property use(s)`,
        );
      }
    }

    const references: string[] = [];
    pushField(references, "See also", vocabulary?.seeAlso, 4);
    pushField(references, "Defined by", vocabulary?.isDefinedBy, 4);
    if (references.length) {
      lines.push("", "**References**", ...references);
    }

    return lines.join("\n");
  }
}
