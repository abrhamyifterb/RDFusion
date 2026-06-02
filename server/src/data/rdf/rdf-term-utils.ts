export function rdfTermValue(term: unknown): string {
	return typeof term === 'object' && term !== null && 'value' in term
		? String((term as { value?: unknown }).value ?? '')
		: '';
}

export function rdfTermType(term: unknown): string {
	return typeof term === 'object' && term !== null && 'termType' in term
		? String((term as { termType?: unknown }).termType ?? '')
		: '';
}

export function rdfLiteralText(term: unknown): string | undefined {
	if (rdfTermType(term) !== 'Literal') {
		return undefined;
	}
	const value = rdfTermValue(term).trim();
	return value || undefined;
}

export function uniqueSorted(values: Iterable<string>, limit = 20): string[] {
	return Array.from(new Set(Array.from(values).filter(Boolean))).sort().slice(0, limit);
}
