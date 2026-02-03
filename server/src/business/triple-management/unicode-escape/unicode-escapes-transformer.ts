import { transformTurtleTextUnicodeEscapes } from './transformer/transform.js';


export class UnicodeEscapesTransformer {
	public transform(text: string, mode: string): string {
		return transformTurtleTextUnicodeEscapes(text, mode);
	}
}
