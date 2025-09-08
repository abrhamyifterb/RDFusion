/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParsedGraph } from '../../../../data/irdf-parser';
import { GroupFormatter } from '../../grouping/turtle/group-by-subject';
import { compactSingletonLists } from './transformations/compact-singleton-lists';
import { numericUntyped } from './transformations/numeric-boolean-untyped';
import { breakPredicates } from './transformations/break-predicates';
import { breakObjects } from './transformations/break-objects';
import { applyKnownPrefixes } from './transformations/apply-known-prefixes';
import { indentBrackets } from './transformations/indent-brackets';
import { breakSubject } from './transformations/break-subject';
import { breakPredObj } from './transformations/break-pred-obj';
import { blankLineBetweenSubjects } from './transformations/blank-line-between-subjects';
import { PrefixRegistry } from '../../../autocomplete/prefix/prefix-registry';

export class TurtleFormatter {
	public async format(
		parsed: ParsedGraph,
		registry: PrefixRegistry,
		cfg: any
	): Promise<string> {
		const groupFormatter = new GroupFormatter();

		const groupedText = groupFormatter.group(parsed);
		
		let lines = groupedText.split('\n');
		lines = numericUntyped(lines, cfg);
		lines = compactSingletonLists(lines, cfg);
		lines = applyKnownPrefixes(lines, cfg, registry);
		lines = breakPredicates(lines, cfg);
		lines = breakObjects(lines, cfg);
		lines = breakPredObj(lines, cfg);
		lines = indentBrackets(lines, cfg);
		lines = blankLineBetweenSubjects(lines, cfg);
		lines = breakSubject(lines, cfg);

		return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
	}
}