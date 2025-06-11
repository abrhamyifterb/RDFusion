export const defaultTurtleValidations = {
	xsdTypeCheck:    true,
	missingTagCheck: true,
	shaclConstraint: true,
	duplicateTriple: true
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
	duplicateTriple: true
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
	missingTagCheck:    "Warning on on literals missing datatype or language tag",
	shaclConstraint:    "SHACL constraint enforcement",
	duplicateTriple:    "Duplicate triple check"
};

export const turtleAutocompleteLabels: Record<TurtleAutocompleteKey,string> = {
	localBased:         "Local-based term completion",
	remoteBased:        "Remote-based term completion",
	prefixDeclaration:  "Undeclared prefix completion"
};

export const jsonLdValidationLabels: Record<JsonLdValidationKey,string> = {
	duplicateId: "Warning on repeated @id",
	missingType: "Warning on nodes without explicit @type",
	undefinedPrefix: "Warning on usage of prefixes not in the context",
	missingTagCheck: "Warning on missing @type/@language for @value",
	xsdTypeCheck: "XSD-Datatype validation",
	emptyLiteral: "Warning on empty string literals",
	nonStringLiteral: "Warning on literals missing datatype or language",
	shaclConstraint: "SHACL constraint enforcement",
	duplicateTriple: "Duplicate triple check"
};

export const jsonLdAutocompleteLabels: Record<JsonLdAutocompleteKey,string> = {
	localBased:         "Local-based Completion",
	remoteBased:        "Remote-based Completion",
	prefixDeclaration:  "Prefix-declaration Completion"
};
