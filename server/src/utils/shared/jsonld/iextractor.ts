import { Node, Range } from 'jsonc-parser';

export interface Extractor<T> {
	extract(ast: Node, text: string): T;
}

export type IdRangeMap = Map<string, Range>;
