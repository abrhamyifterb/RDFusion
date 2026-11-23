import type { Connection } from 'vscode-languageserver';
import { canonURDNA2015, sortLinesUnique } from '../../rdf-diff/canonize.js';
import { parseNQuadsToGraph, turtleToNQuads } from '../../rdf-diff/parse.js';

export class TurtleTransformationSafetyError extends Error {
	constructor(message: string) {
		super(`Turtle formatting was cancelled because ${message} The document was not changed.`);
		this.name = 'TurtleTransformationSafetyError';
	}
}

async function turtleToVerifiedNQuads(text: string, baseIRI: string, label: 'original' | 'formatted') {
	try {
		return await turtleToNQuads(text, baseIRI);
	} catch {
		throw new TurtleTransformationSafetyError(
			label === 'original'
				? 'the original Turtle could not be verified safely.'
				: 'the generated output is not valid Turtle.',
		);
	}
}

export async function assertTurtleTransformationSafe(
	originalText: string,
	formattedText: string,
	baseIRI: string,
	connection: Connection,
): Promise<void> {
	const original = await turtleToVerifiedNQuads(originalText, baseIRI, 'original');
	const formatted = await turtleToVerifiedNQuads(formattedText, baseIRI, 'formatted');
	const originalHasBlankNodes = parseNQuadsToGraph(original).bnodes.size > 0;
	const formattedHasBlankNodes = parseNQuadsToGraph(formatted).bnodes.size > 0;

	if (!originalHasBlankNodes && !formattedHasBlankNodes) {
		if (sortLinesUnique(original) !== sortLinesUnique(formatted)) {
			throw new TurtleTransformationSafetyError('the generated output changes the RDF data.');
		}
		return;
	}

	if (originalHasBlankNodes !== formattedHasBlankNodes) {
		throw new TurtleTransformationSafetyError('the generated output changes the RDF data.');
	}

	let canonicalOriginal: string;
	let canonicalFormatted: string;
	try {
		[canonicalOriginal, canonicalFormatted] = await Promise.all([
			canonURDNA2015(original, connection),
			canonURDNA2015(formatted, connection),
		]);
	} catch {
		throw new TurtleTransformationSafetyError('the RDF data could not be verified safely.');
	}

	if (canonicalOriginal !== canonicalFormatted) {
		throw new TurtleTransformationSafetyError('the generated output changes the RDF data.');
	}
}
