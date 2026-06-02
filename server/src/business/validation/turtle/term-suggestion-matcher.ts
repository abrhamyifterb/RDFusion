export interface TermSuggestion {
  curie: string;
  prefix: string;
  term: string;
  distance: number;
  score: number;
  source: 'remote' | 'local';
}

export interface FindTermSuggestionsOptions {
  prefix: string;
  term: string;
  remoteTerms: Iterable<string>;
  localTerms?: Iterable<string>;
  limit?: number;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}

function normalizedSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length, 1);
  return 1 - (levenshtein(a.toLowerCase(), b.toLowerCase()) / max);
}

function looksClose(input: string, candidate: string, distance: number): boolean {
  const lowerInput = input.toLowerCase();
  const lowerCandidate = candidate.toLowerCase();
  if (lowerInput === lowerCandidate) return true;
  if (distance <= 2) return true;
  if (input.length >= 6 && distance <= 3) return true;
  if (lowerCandidate.startsWith(lowerInput) || lowerInput.startsWith(lowerCandidate)) return true;
  return normalizedSimilarity(input, candidate) >= 0.72;
}

function suggestionScore(input: string, candidate: string, distance: number): number {
  const lowerInput = input.toLowerCase();
  const lowerCandidate = candidate.toLowerCase();
  let score = normalizedSimilarity(input, candidate) * 100;
  if (lowerInput === lowerCandidate) score += 50;
  if (lowerCandidate.startsWith(lowerInput) || lowerInput.startsWith(lowerCandidate)) score += 12;
  score -= distance * 2;
  return score;
}

export function findTermSuggestions(options: FindTermSuggestionsOptions): TermSuggestion[] {
  const {
    prefix,
    term,
    remoteTerms,
    localTerms = [],
    limit = 5,
  } = options;
  const suggestions = new Map<string, TermSuggestion>();

  const add = (candidate: string, source: 'remote' | 'local') => {
    if (!candidate || candidate === term) return;
    const distance = levenshtein(term.toLowerCase(), candidate.toLowerCase());
    if (!looksClose(term, candidate, distance)) return;
    const score = suggestionScore(term, candidate, distance) + (source === 'remote' ? 5 : 0);
    const curie = prefix && prefix !== '@vocab' ? `${prefix}:${candidate}` : candidate;
    const existing = suggestions.get(curie);
    if (!existing || score > existing.score) {
      suggestions.set(curie, { curie, prefix, term: candidate, distance, score, source });
    }
  };

  for (const candidate of remoteTerms) add(candidate, 'remote');
  for (const candidate of localTerms) add(candidate, 'local');

  return Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score || a.distance - b.distance || a.term.localeCompare(b.term))
    .slice(0, limit);
}
