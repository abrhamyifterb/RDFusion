/* eslint-disable no-control-regex */
import URI from 'uri-js';

const ABSOLUTE_IRI_SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

const GENERIC_IRI_DISALLOWED = /[\u0000-\u0020<>"{}|\\^`]/;

export interface ParsedIriScheme {
  scheme?: string;
  error?: string;
}

export function parseGenericIriScheme(raw: string): ParsedIriScheme {
  const parsed = URI.parse(raw);
  if (!parsed.error) {
    return { scheme: (parsed.scheme ?? '').toLowerCase() || undefined };
  }

  const fallback = ABSOLUTE_IRI_SCHEME.exec(raw);
  if (fallback) {
    const rest = raw.slice(fallback[0].length);
    if (rest && !rest.startsWith('//') && !GENERIC_IRI_DISALLOWED.test(raw)) {
      return { scheme: fallback[1].toLowerCase() };
    }
  }

  return { error: parsed.error };
}
