export const defaultTurtleValidations = {
	xsdTypeCheck:    true,
	missingTagCheck: true,
	shaclConstraint: true,
	duplicateTriple: true,
	remoteTermVocabulary: true
};
export type TurtleValidationKey = keyof typeof defaultTurtleValidations;

export const defaultTurtleAutocomplete = {
	localBased:  true,
	remoteBased: true,
	prefixDeclaration:  true
};
export type TurtleAutocompleteKey = keyof typeof defaultTurtleAutocomplete;

export const defaultJsonLdValidations = {
	duplicateId: true,
	missingType: true,
	undefinedPrefix: true,
	emptyLiteral: true,
	nonStringLiteral: true,
	xsdTypeCheck:    true,
	missingTagCheck: true,
	shaclConstraint: true,
	duplicateTriple: true,
	remoteTermVocabulary: true
};
export type JsonLdValidationKey = keyof typeof defaultJsonLdValidations;

export const defaultJsonLdAutocomplete = {
	localBased: true,
	remoteBased: true,
	prefixDeclaration: true
};
export type JsonLdAutocompleteKey = keyof typeof defaultJsonLdAutocomplete;

export const turtleValidationLabels: Record<TurtleValidationKey,string> = {
	xsdTypeCheck:       "XSD-Datatype validation",
	missingTagCheck:    "Warn when literals are missing a datatype or language tag",
	shaclConstraint:    "SHACL validation",
	duplicateTriple:    "Duplicate triple check",
	remoteTermVocabulary: "Remote vocabulary typo hints"
};

export const turtleAutocompleteLabels: Record<TurtleAutocompleteKey,string> = {
	localBased:         "Local term completion",
	remoteBased:        "Remote vocabulary term completion",
	prefixDeclaration:  "Undeclared prefix completion"
};

export const jsonLdValidationLabels: Record<JsonLdValidationKey,string> = {
	duplicateId: "Warn when @id values are repeated",
	missingType: "Warn when nodes are missing @type",
	undefinedPrefix: "Warn when prefixes are not defined in @context",
	missingTagCheck: "Warn when @value lacks @type or @language",
	xsdTypeCheck: "XSD-Datatype validation",
	emptyLiteral: "Warn on empty string literals",
	nonStringLiteral: "Warn when JSON-LD literal values are not strings",
	shaclConstraint: "SHACL validation",
	duplicateTriple: "Duplicate triple check",
	remoteTermVocabulary: "Remote vocabulary typo hints"
};

export const jsonLdAutocompleteLabels: Record<JsonLdAutocompleteKey,string> = {
	localBased:         "Local term completion",
	remoteBased:        "Remote vocabulary term completion",
	prefixDeclaration:  "Prefix declaration completion"
};
