import { ValidationRule } from '../../utils.js';
import ContextBase from './rules/context-base.js';
import ContextDir from './rules/context-dir.js';
import ContextTypeCheck from './rules/context-type.js';
import ContextVocab from './rules/context-vocab.js';
import LanguageValue from './rules/language-value.js';
import ListRule            from './rules/list.js';
import MultipleContext from './rules/multiple-context.js';
import RootTypeCheck from './rules/root-type.js';
import SetRule             from './rules/set.js';
import ValueScalar from './rules/value-scalar.js';

export const syntaxRules: ValidationRule[] = [
	new ListRule(),
	new SetRule(),
	new ValueScalar(),
	new LanguageValue(),
	new ContextBase(),
	new ContextVocab(),
	new ContextDir(),
	new ContextTypeCheck(),
	new MultipleContext(),
	new RootTypeCheck()
];
