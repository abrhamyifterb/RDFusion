import { Parser as N3Parser, Writer as N3Writer, Quad } from 'n3';

export function turtleToNQuads(text: string, base?: string): string {
	if (!text || !text.trim()) {
		return '';
	}
	const parser = new N3Parser({ baseIRI: base, format: 'text/turtle' });
	const quads: Quad[] = parser.parse(text);
	if (!quads.length) {
		return '';
	}
	let out = '';
	const writer = new N3Writer({ format: 'N-Quads' });
	writer.addQuads(quads);
	writer.end((err, result) => { 
		if (err) {
			throw err;
		} 
		out = result || ''; 
	});
	return out;
}
