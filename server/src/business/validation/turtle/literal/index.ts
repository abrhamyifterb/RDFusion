import { TtlValidation } from '../../../../utils/shared/turtle/ttl-types';
import LanguageTag from './rules/language-tag.js';
import MissingDatatypeOrLang from './rules/missing-datatype-lang.js';
import InvalidXsdDatatype from './rules/xsd-datatype.js';

export const literalRules: TtlValidation[] = [
	new MissingDatatypeOrLang(),
	new InvalidXsdDatatype(),
	new LanguageTag(),
];
