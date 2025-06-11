/* eslint-disable @typescript-eslint/no-explicit-any */
import { Quad, Writer } from 'n3';
import jsonld from 'jsonld';

export class JsonldFilterCommand {
	constructor() {}

	public async format(quads: Quad[]): Promise<string> {
		const writer = new Writer({ format: 'N-Quads' });
		quads.forEach(q => writer.addQuad(q));
		const nquads = await new Promise<string>((resolve, reject) =>
			writer.end((err: any, result: string | PromiseLike<string>) => err ? reject(err) : resolve(result))
		);
	

		const rdfObject = await jsonld.fromRDF(nquads, { format: 'application/n-quads' });
    	return JSON.stringify(rdfObject, null, 2);
	}
}