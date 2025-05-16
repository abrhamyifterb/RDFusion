import { ShaclShape } from '../../../data/shacl/ishape-extractor';

const SH = {
	targetClass: 'http://www.w3.org/ns/shacl#targetClass',
	property:    'http://www.w3.org/ns/shacl#property',
	path:        'http://www.w3.org/ns/shacl#path',
	description: 'http://www.w3.org/ns/shacl#description',
	name:        'http://www.w3.org/ns/shacl#name'
};

export interface ShaclProperty {
  predicate:   string;
  description?: string;
  name?:        string;
}

export class ShaclRegistry {
  private byClass = new Map<string, ShaclProperty[]>();

  constructor(shapes: ShaclShape[]) {
    this.update(shapes);
  }

  public update(shapes: ShaclShape[]): void {
    this.byClass.clear();
    for (const shape of shapes) {
      // gather all target classes
      const targets = shape.quads
        .filter(q => q.predicate.value === SH.targetClass)
        .map(q => q.object.value);
      // gather property-shape node IDs
      const propNodes = shape.quads
        .filter(q => q.predicate.value === SH.property)
        .map(q => q.object.value);

      for (const node of propNodes) {
        const quadsForNode = shape.quads.filter(q => q.subject.value === node);
        const pathQuad = quadsForNode.find(q => q.predicate.value === SH.path);
        if (!pathQuad) continue;

        const predicateIri = pathQuad.object.value;
        const nameQuad     = quadsForNode.find(q => q.predicate.value === SH.name);
        const descQuad     = quadsForNode.find(q => q.predicate.value === SH.description);

        const prop: ShaclProperty = {
          predicate:   predicateIri,
          name:        nameQuad?.object.value,
          description: descQuad?.object.value
        };

        for (const cls of targets) {
          if (!this.byClass.has(cls)) {
            this.byClass.set(cls, []);
          }
          this.byClass.get(cls)!.push(prop);
        }
      }
    }
  }

  public getPropertiesForClass(classIri: string): ShaclProperty[] {
    return this.byClass.get(classIri) ?? [];
  }
}
