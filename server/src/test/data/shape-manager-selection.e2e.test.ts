/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'vscode-languageserver/node';
import { Cache } from '../../data/cache/lru-cache';
import { DataManager } from '../../data/data-manager';
import { ShapeManager } from '../../data/shacl/shape-manager';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } as any,
  } as any as Connection;
}

const SHACL_TEXT = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.com/> .

ex:PersonShape a sh:NodeShape ;
  sh:name "Person" ;
  sh:message "Person must have required fields" ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path ex:name ;
    sh:name "name" ;
    sh:message "Name is required" ;
    sh:minCount 1
  ] ;
  sh:property [
    sh:path ex:email ;
    sh:name "email" ;
    sh:message "Email is required" ;
    sh:minCount 1
  ] .

ex:BookShape a sh:NodeShape ;
  sh:targetClass ex:Book ;
  sh:property [ sh:path ex:title ; sh:minCount 1 ] .
`;

describe('ShapeManager SHACL selection correctness', () => {
  it('keeps auto as all shapes, custom empty as no shapes, and custom property selections as explicit subsets', async () => {
    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const uri = 'file:///workspace/shapes.ttl';

    const parsed = await dataManager.parseDocument(uri, SHACL_TEXT, 1);
    shapeManager.updateShapeIndex(uri, parsed);

    const listed = shapeManager.listShapes({ mode: 'auto' });
    expect(listed.files).toHaveLength(1);
    expect(listed.files[0].shapes).toHaveLength(2);

    const person = listed.files[0].shapes.find(shape => shape.subjectValue.endsWith('PersonShape'));
    expect(person).toBeTruthy();
    expect(person!.description).toBe('Person must have required fields');
    expect(person!.properties.map(prop => prop.pathDisplay).sort()).toEqual(['email', 'name']);

    expect(shapeManager.getSelectedShapes({ mode: 'auto' })).toHaveLength(2);
    expect(shapeManager.getSelectedShapes({ mode: 'custom', custom: { files: [] } })).toHaveLength(0);

    const selectedNameProperty = person!.properties.find(prop => prop.pathDisplay === 'name')!;
    const selected = shapeManager.getSelectedShapes({
      mode: 'custom',
      custom: {
        files: [{
          fileUri: uri,
          shapes: [{
            shapeId: person!.id,
            enabledTargets: [person!.targets[0].key],
            enabledPropertyShapeIds: [selectedNameProperty.id],
          }],
        }],
      },
    });

    expect(selected).toHaveLength(1);
    expect(selected[0].subject).toBe(person!.subjectValue);
    expect(selected[0].targets.map(target => target.key)).toEqual([person!.targets[0].key]);
    expect(selected[0].properties.map(prop => prop.pathDisplay)).toEqual(['name']);
    expect(selected[0].quads.some((quad: any) => quad.object?.value?.endsWith('email'))).toBe(false);
  });

  it('removes indexed shapes for deleted files without leaving stale listShapes state', async () => {
    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const shapeManager = new ShapeManager(connection);
    const uri = 'file:///workspace/shapes.ttl';

    const parsed = await dataManager.parseDocument(uri, SHACL_TEXT, 1);
    shapeManager.updateShapeIndex(uri, parsed);
    expect(shapeManager.listShapes().files[0].shapeCount).toBe(2);

    shapeManager.removeShapeIndex(uri);
    expect(shapeManager.getShapeCountForUri(uri)).toBe(0);
    expect(shapeManager.getSelectedShapes({ mode: 'auto' })).toHaveLength(0);
    expect(shapeManager.listShapes().files).toHaveLength(0);
  });
});
