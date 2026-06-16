import type { RDFusionFileType } from "../../../data/document-snapshot.js";

export function textLooksLikeJsonLd(text: string | undefined): boolean {
  return typeof text === "string" && /"@context"\s*:/.test(text);
}

export function detectRDFusionFileType(
  uri: string,
  text?: string,
  languageId?: string,
): RDFusionFileType {
  const lower = uri.toLowerCase();
  if (languageId === "turtle" || lower.endsWith(".ttl")) {
    return "turtle";
  }
  if (languageId === "jsonld" || lower.endsWith(".jsonld")) {
    return "jsonld";
  }
  if ((languageId === "json" || lower.endsWith(".json")) && textLooksLikeJsonLd(text)) {
    return "jsonld";
  }
  return "unknown";
}

export function isJsonLdLikeDocument(
  uri: string,
  languageId?: string,
  text?: string,
): boolean {
  return detectRDFusionFileType(uri, text, languageId) === "jsonld";
}
