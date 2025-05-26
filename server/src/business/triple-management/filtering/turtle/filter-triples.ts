import { Quad, Literal } from 'n3';

interface LiteralFilter {
	value: string;
	datatype?: string;
}

export class FilterQuads {
	private static normalize(s: string): string {
		// eslint-disable-next-line no-useless-escape
		return s.replace(/^['\"]|['\"]$/g, '').toLowerCase();
	}

	private static resolveIri(raw: string, prefixes: Record<string, string>): string {
		const trimmed = raw.trim();
		if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
			return trimmed.slice(1, -1);
		}
		const [pfx, local] = trimmed.split(':', 2);
		if (prefixes[pfx]) {
			return prefixes[pfx] + local;
		}
		return trimmed;
	}
	
	private static parseLiteralFilter(raw: string, prefixes: Record<string, string>): LiteralFilter {
		// eslint-disable-next-line no-useless-escape
		const text = raw.trim().replace(/^['\"]|['\"]$/g, '');
		const parts = text.split('^^');
		if (parts.length === 2) {
			return {
				value: parts[0],
				datatype: FilterQuads.resolveIri(parts[1], prefixes)
			};
		}
		return { value: parts[0] };
	}

	private static matchesIri(
		value: string,
		patterns: string[],
		prefixes: Record<string, string>
	): boolean {
		if (patterns.length === 0) return true;
		const target = FilterQuads.resolveIri(value, prefixes).toLowerCase();
		return patterns
			.map(p => FilterQuads.resolveIri(p, prefixes).toLowerCase())
			.some(pat => pat === target);
	}

	private static matchesLiteral(
		q: Quad,
		filters: LiteralFilter[],
		_prefixes: Record<string, string>
	): boolean {
		if (filters.length === 0) return true;
		if (q.object.termType !== 'Literal') return false;
		const lit = q.object as Literal;
		const val = FilterQuads.normalize(lit.value);
		const dt = lit.datatype?.value;
		return filters.some(f => {
			const fv = FilterQuads.normalize(f.value);
			const fd = f.datatype;
			return fv === val && (!fd || fd === dt);
		});
	}

	public static apply(
		quads: Quad[],
		subjectFilters: string[],
		predicateFilters: string[],
		objectFilters: string[],
		prefixes: Record<string, string>
	): Quad[] {
		const objFilters = objectFilters.map(raw =>
			this.parseLiteralFilter(raw, prefixes)
		);

		return quads.filter(q =>
			FilterQuads.matchesIri(q.subject.value, subjectFilters, prefixes) &&
			FilterQuads.matchesIri(q.predicate.value, predicateFilters, prefixes) &&
			(q.object.termType === 'Literal'
				? FilterQuads.matchesLiteral(q, objFilters, prefixes)
				: FilterQuads.matchesIri(q.object.value, objectFilters, prefixes))
		);
	}
}
