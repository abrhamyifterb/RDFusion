/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { ShapeManager } from '../../data/shacl/shape-manager';

const fakeConnection: any = {
  console: { log() {}, warn() {}, error() {} },
  window: { showWarningMessage() {}, showErrorMessage() {} },
};

function pg(quads: { s: string; p: string; o: string }[]) {
  return {
    quads: quads.map(({ s, p, o }) => ({
      subject:   { value: s },
      predicate: { value: p },
      object:    { value: o },
    })),
    tokens: [],
    errors: [],
    cst: [],
  };
}

describe('ShapeManager (SHACL extraction)', () => {
  const sh = new ShapeManager(fakeConnection);
  const SH = 'http://www.w3.org/ns/shacl#';
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  it('extracts shapes when rdf:type sh:Shape is present (explicit type)', () => {
    const g = pg([
      { s: 'b1', p: RDF_TYPE, o: `${SH}Shape` },
    ]);

    sh.updateShapeIndex('file:///shape.ttl', g);
    const all = sh.getGlobalShapes();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(x => x.subject === 'b1')).toBe(true);
  });

  

  it('recognizes sh:NodeShape with sh:targetClass and property shapes, and updates per-file', () => {
    const g1 = pg([
      // NodeShape with targetClass and a property constraint
      { s: 'ex:PersonShape', p: RDF_TYPE, o: `${SH}NodeShape` },
      { s: 'ex:PersonShape', p: `${SH}targetClass`, o: 'ex:Person' },
      { s: 'ex:PersonShape', p: `${SH}property`, o: '_:bnode1' },
      { s: '_:bnode1', p: `${SH}path`, o: 'ex:age' },
      { s: '_:bnode1', p: `${SH}minCount`, o: '1' },
    ]);
    sh.updateShapeIndex('file:///person.shape.ttl', g1);

    let all = sh.getGlobalShapes();
    expect(all.some(x => x.subject === 'ex:PersonShape')).toBe(true);

    const g2 = pg([
      { s: 'ex:something', p: 'http://example.org/p', o: 'http://example.org/o' },
    ]);
    sh.updateShapeIndex('file:///person.shape.ttl', g2);

    all = sh.getGlobalShapes();
    expect(all.some(x => x.subject === 'ex:PersonShape')).toBe(false);
  });
});
