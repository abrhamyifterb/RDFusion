export function makeShort(iri: string, max: number): string | null {
	if (iri.length <= max) {return null;}
	const middle = Math.floor(max / 2);
	return `${iri.slice(0, middle)}…${iri.slice(iri.length - middle)}`;
}

export function buildIriKey(text: string, index: number): string {
	return `${index}:${text}`;
}
