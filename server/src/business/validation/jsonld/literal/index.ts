
import { ValidationRule } from '../../utils.js';
import DuplicateCheck from './rules/duplicate-finder.js';
import EmptyLiteral from './rules/empty-literal.js';
import JsonLiteral from './rules/json-literal.js';
import LanguageTag from './rules/language-tag.js';
import MissingTypeOrLang from './rules/missing-type-lang.js';
import MissingValue from './rules/missing-value.js';
import XsdDatatype from './rules/xsd-datatype.js';

export const literalRules: ValidationRule[] = [
	new MissingValue(),
	new EmptyLiteral(),
	new MissingTypeOrLang(),
	new LanguageTag(),
	new XsdDatatype(),
	new JsonLiteral(),
	new DuplicateCheck()
];
