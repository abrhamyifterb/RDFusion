/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { ShapeManager } from '../../data/shacl/shape-manager';
import { buildDataIndex, computeCoverage } from '../../data/shacl/coverage';
import type { DocumentSnapshot } from '../../data/document-snapshot';

const fakeConnection: any = {
  console: { log() {}, warn() {}, error() {} },
  window: { showWarningMessage() {}, showErrorMessage() {} },
};

const SH = 'http://www.w3.org/ns/shacl#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const EX = 'http://example.com/';

function term(value: string) {
  return { value };
}

function pg(quads: { s: string; p: string; o: string }[]) {
  return {
    quads: quads.map(({ s, p, o }) => ({ subject: term(s), predicate: term(p), object: term(o) })),
    tokens: [],
    errors: [],
  };
}

function snapshot(uri: string, quads: { s: string; p: string; o: string }[]): DocumentSnapshot {
  return {
    uri,
    version: 1,
    fileType: 'turtle',
    parsedGraph: pg(quads),
    parsedAt: Date.now(),
    byteSize: 100,
  };
}

describe('SHACL workspace coverage', () => {
  it('computes selected-shape property coverage and governance gaps over data snapshots', () => {
    const shapeManager = new ShapeManager(fakeConnection);
    const shapesGraph = pg([
      { s: `${EX}PersonShape`, p: RDF_TYPE, o: `${SH}NodeShape` },
      { s: `${EX}PersonShape`, p: `${SH}targetClass`, o: `${EX}Person` },
      { s: `${EX}PersonShape`, p: `${SH}property`, o: '_:name' },
      { s: '_:name', p: `${SH}path`, o: `${EX}name` },
      { s: `${EX}PersonShape`, p: `${SH}property`, o: '_:email' },
      { s: '_:email', p: `${SH}path`, o: `${EX}email` },
      { s: `${EX}UnusedShape`, p: RDF_TYPE, o: `${SH}NodeShape` },
      { s: `${EX}UnusedShape`, p: `${SH}targetClass`, o: `${EX}Unused` },
      { s: `${EX}UnusedShape`, p: `${SH}property`, o: '_:unusedProp' },
      { s: '_:unusedProp', p: `${SH}path`, o: `${EX}unused` },
    ]);
    shapeManager.updateShapeIndex('file:///shapes.ttl', shapesGraph);

    const dataSnapshots = [snapshot('file:///data.ttl', [
      { s: `${EX}alice`, p: RDF_TYPE, o: `${EX}Person` },
      { s: `${EX}alice`, p: `${EX}name`, o: 'Alice' },
      { s: `${EX}alice`, p: `${EX}extra`, o: 'x' },
      { s: `${EX}bob`, p: RDF_TYPE, o: `${EX}Person` },
      { s: `${EX}bob`, p: `${EX}email`, o: 'bob@example.com' },
      { s: `${EX}carol`, p: RDF_TYPE, o: `${EX}OtherClass` },
      { s: `${EX}carol`, p: `${EX}other`, o: 'value' },
    ])];

    const idx = buildDataIndex(dataSnapshots, shapeManager.getIndexedShapeUris());
    const coverage = computeCoverage(
      shapeManager.getSelectedShapes({ mode: 'auto' }),
      idx,
      { mode: 'auto' },
      shapeManager.getRevision(),
    );

    const person = coverage.shapes.find(s => s.shapeIri === `${EX}PersonShape`)!;
    expect(person.focusNodes).toBe(2);
    expect(person.coveredFocusNodes).toBe(2);
    expect(person.coveragePct).toBe(100);
    expect(person.propertyPresencePct).toBe(50);
    expect(person.propertySlotsPresent).toBe(2);
    expect(person.propertySlotsTotal).toBe(4);
    expect(coverage.dataNodeCoveragePct).toBe(66.7);
    expect(coverage.governedDataSubjectsCount).toBe(2);
    expect(coverage.totalDataSubjects).toBe(3);
    expect(coverage.governedFieldCoveragePct).toBe(66.7);
    expect(coverage.governedPredicateAssertionsCount).toBe(2);
    expect(coverage.totalPredicateAssertionsOnGovernedSubjects).toBe(3);
    expect(coverage.shapePropertyPresencePct).toBe(50);
    expect(person.properties.find(p => p.pathIri === `${EX}name`)?.nodesWithProperty).toBe(1);
    expect(person.properties.find(p => p.pathIri === `${EX}email`)?.nodesWithProperty).toBe(1);
    expect(coverage.deadShapes).toContain(`${EX}UnusedShape`);
    expect(coverage.orphanClasses).toContain(`${EX}OtherClass`);
    expect(coverage.orphanPredicates).toContain(`${EX}extra`);
    expect(coverage.referencedPredicatesCount).toBe(2);
  });

  it('respects custom property selection when computing coverage', () => {
    const shapeManager = new ShapeManager(fakeConnection);
    shapeManager.updateShapeIndex('file:///shapes.ttl', pg([
      { s: `${EX}PersonShape`, p: RDF_TYPE, o: `${SH}NodeShape` },
      { s: `${EX}PersonShape`, p: `${SH}targetClass`, o: `${EX}Person` },
      { s: `${EX}PersonShape`, p: `${SH}property`, o: '_:name' },
      { s: '_:name', p: `${SH}path`, o: `${EX}name` },
      { s: `${EX}PersonShape`, p: `${SH}property`, o: '_:email' },
      { s: '_:email', p: `${SH}path`, o: `${EX}email` },
    ]));

    const listed = shapeManager.listShapes({ mode: 'auto' });
    const shape = listed.files[0].shapes[0];
    const nameProp = shape.properties.find(p => p.path === `${EX}name`)!;
    const selection = {
      mode: 'custom' as const,
      custom: {
        files: [{
          fileUri: 'file:///shapes.ttl',
          shapes: [{
            shapeId: shape.id,
            enabledTargets: shape.targetKeys,
            enabledPropertyShapeIds: [nameProp.id],
          }],
        }],
      },
    };

    const idx = buildDataIndex([snapshot('file:///data.ttl', [
      { s: `${EX}alice`, p: RDF_TYPE, o: `${EX}Person` },
      { s: `${EX}alice`, p: `${EX}name`, o: 'Alice' },
      { s: `${EX}alice`, p: `${EX}email`, o: 'alice@example.com' },
    ])]);

    const coverage = computeCoverage(shapeManager.getSelectedShapes(selection), idx, selection, shapeManager.getRevision());
    expect(coverage.measuredPathsCount).toBe(1);
    expect(coverage.shapes[0].properties).toHaveLength(1);
    expect(coverage.shapes[0].properties[0].pathIri).toBe(`${EX}name`);
    expect(coverage.shapePropertyPresencePct).toBe(100);
    expect(coverage.governedFieldCoveragePct).toBe(50);
    expect(coverage.orphanPredicates).toContain(`${EX}email`);
  });
});
