// subjectIndex.ts
import { Quad } from 'n3';
import { ParsedGraph } from '../../../../data/irdf-parser';

export class SubjectIndex {
	private index = new Map<string, Quad[]>();

	public getBySubject(iri: string, graph: ParsedGraph): Quad[] {
		let bucket = this.index.get(iri);
		if (!bucket) {
			bucket = graph.quads.filter(q => q.subject.value === iri);
			this.index.set(iri, bucket);
		}
		return bucket;
	}
	
	public applyDelta(delta: { added: Quad[]; removed: Quad[] }) {
		for (const q of delta.removed) {
		const bucket = this.index.get(q.subject.value);
		if (bucket) {
			for (let i = bucket.length - 1; i >= 0; i--) {
				if (bucket[i] === q) bucket.splice(i, 1);
			}
			if (bucket.length === 0) this.index.delete(q.subject.value);
		}
		}
		for (const q of delta.added) {
			const bucket = this.index.get(q.subject.value);
			if (bucket) bucket.push(q);
			else this.index.set(q.subject.value, [q]);
		}
	}

	public clear() {
		this.index.clear();
	}
}
