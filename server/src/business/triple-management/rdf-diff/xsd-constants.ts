export const NS = {
	XSD: 'http://www.w3.org/2001/XMLSchema#',
};

export const XSD = {
	string:  `${NS.XSD}string`,
	boolean: `${NS.XSD}boolean`,
	decimal: `${NS.XSD}decimal`,
	float:   `${NS.XSD}float`,
	double:  `${NS.XSD}double`,
	integer: `${NS.XSD}integer`,

	long:            `${NS.XSD}long`,
	int:             `${NS.XSD}int`,
	short:           `${NS.XSD}short`,
	byte:            `${NS.XSD}byte`,
	nonNegativeInteger: `${NS.XSD}nonNegativeInteger`,
	nonPositiveInteger: `${NS.XSD}nonPositiveInteger`,
	positiveInteger:    `${NS.XSD}positiveInteger`,
	negativeInteger:    `${NS.XSD}negativeInteger`,
	unsignedLong:   `${NS.XSD}unsignedLong`,
	unsignedInt:    `${NS.XSD}unsignedInt`,
	unsignedShort:  `${NS.XSD}unsignedShort`,
	unsignedByte:   `${NS.XSD}unsignedByte`,
} as const;

export const INTEGER_FAMILY = new Set<string>([
	XSD.integer, XSD.long, XSD.int, XSD.short, XSD.byte,
	XSD.nonNegativeInteger, XSD.nonPositiveInteger,
	XSD.positiveInteger, XSD.negativeInteger,
	XSD.unsignedLong, XSD.unsignedInt, XSD.unsignedShort, XSD.unsignedByte,
]);
