import { ValidationRule } from '../../utils.js';
import ContextBase from './rules/context-base.js';
import ContextDir from './rules/context-dir.js';
// import ContextObject from './rules/context-object.js';
import ContextVocab from './rules/context-vocab.js';
import LanguageValue from './rules/language-value.js';
import ListRule            from './rules/list.js';
import SetRule             from './rules/set.js';
import ValueScalar from './rules/value-scalar.js';


export const syntaxRules: ValidationRule[] = [
	new ListRule(),
	new SetRule(),
	new ValueScalar(),
	new LanguageValue(),
	// new ContextObject(),
	new ContextBase(),
	new ContextVocab(),
	new ContextDir(),
];
