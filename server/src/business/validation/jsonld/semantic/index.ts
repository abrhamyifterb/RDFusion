import { ValidationRule } from '../../utils.js';
import ContainerUsageCheck from './rules/container-consistency.js';
import DuplicateContextTerm from './rules/duplicate-context-term.js';
import DuplicateId from './rules/duplicate-id.js';
import GraphArrayCheck from './rules/graph-array.js';
import IdUsageCheck from './rules/id-usage.js';
import InvalidIri from './rules/invalid-iri.js';
import InvalidTypeValue from './rules/invalid-type-value.js';
import MissingType from './rules/missing-type.js';
import NonStringIdCheck from './rules/non-string-id.js';
import RelativeIriCheck from './rules/relative-iri.js';
import ReservedKeywordRedefinition from './rules/reserved-keywords.js';
import ReversePropertyCheck from './rules/reverse-property.js';
import ReverseTermCheck from './rules/reverse-term.js';
import UndefinedPrefix from './rules/undefined-prefix.js';
import UnknownKeywordCheck from './rules/unknown-keyword.js';


export const semanticRules: ValidationRule[] = [
	new MissingType(),
	new DuplicateId(),
	new DuplicateContextTerm(),
	new UndefinedPrefix(),
	new InvalidIri(),
	new ReservedKeywordRedefinition(),
	new ContainerUsageCheck(),
	new IdUsageCheck(),
	new NonStringIdCheck(),
	new RelativeIriCheck(),
	new UnknownKeywordCheck(),
	new GraphArrayCheck(),
	new InvalidTypeValue(),
	new ReversePropertyCheck(),
	new ReverseTermCheck()
];
