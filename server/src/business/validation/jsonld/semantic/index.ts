import { ValidationRule } from '../../utils.js';
// import ContainerConsistency from './rules/container-consistency.js';
import DuplicateContextTerm from './rules/duplicate-context-term.js';
import DuplicateId from './rules/duplicate-id.js';
import InvalidIri from './rules/invalid-iri.js';
import MissingType from './rules/missing-type.js';
import UndefinedPrefix from './rules/undefined-prefix.js';


export const semanticRules: ValidationRule[] = [
	new MissingType(),
	new DuplicateId(),
	new DuplicateContextTerm(),
	new UndefinedPrefix(),
	new InvalidIri(),
	// new ContainerConsistency(),
	// new Vocabulary(),
];
