/* eslint-disable @typescript-eslint/no-explicit-any */
export function numericUntyped(lines: string[], cfg: any): string[] {
	if (!cfg.useUntypedNumeric) {return lines;}

	// eslint-disable-next-line no-useless-escape
	const numRe = /"(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)"\^\^(?:<http:\/\/www\.w3\.org\/2001\/XMLSchema#(?:integer|decimal|double|float)>|xsd:(?:integer|decimal|double|float))/g;
	const boolRe = /"(true|false|1|0)"\^\^(?:<http:\/\/www\.w3\.org\/2001\/XMLSchema#boolean>|xsd:boolean)/g;
	const strRe = /(".*?")\^\^(?:<http:\/\/www\.w3\.org\/2001\/XMLSchema#string>|xsd:string)/g;

	return lines.map(line =>
		line
			.replace(numRe, '$1')
			.replace(boolRe, '$1')
			.replace(strRe, '$1')
	);
}