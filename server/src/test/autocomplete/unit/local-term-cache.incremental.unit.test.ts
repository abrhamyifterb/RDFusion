/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import type { Connection } from 'vscode-languageserver/node';
import { Cache } from '../../../data/cache/lru-cache';
import { DataManager } from '../../../data/data-manager';
import { LocalTermCache } from '../../../business/autocomplete/term-completion/local-term-cache';

function mockConnection(): Connection {
  return {
    console: { error: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn() } as any,
  } as any as Connection;
}

const docOne = `
@prefix ex: <http://example.com/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
ex:Person a owl:Class ;
  rdfs:label "Person" ;
  rdfs:comment "A person resource." .
ex:knows a owl:ObjectProperty ;
  rdfs:domain ex:Person ;
  rdfs:range ex:Person .
ex:Alice a ex:Person ; ex:knows ex:Bob .
`;

const docTwo = `
@prefix ex: <http://example.com/> .
ex:Bob ex:knows ex:Carol .
`;

describe('LocalTermCache incremental updates', () => {
  it('updates and removes terms per URI without a full rebuild', async () => {
    const connection = mockConnection();
    const dataManager = new DataManager(new Cache(10), connection);
    const cache = new LocalTermCache(dataManager);

    await dataManager.parseDocument('file:///one.ttl', docOne, 1);
    cache.updateUri('file:///one.ttl');
    expect(cache.get('ex')).toEqual(new Set(['Person', 'knows', 'Alice', 'Bob']));
    const knowsInfo = cache.getInfo('ex', 'knows');
    expect(knowsInfo?.vocabulary?.roles).toContain('property');
    expect(knowsInfo?.vocabulary?.domains).toContain('ex:Person');
    expect(knowsInfo?.vocabulary?.ranges).toContain('ex:Person');
    expect(knowsInfo?.vocabulary?.examples ?? []).toEqual([]);
    const personInfo = cache.getInfo('ex', 'Person');
    expect(personInfo?.vocabulary?.labels).toContain('Person');
    expect(personInfo?.vocabulary?.comments).toContain('A person resource.');

    await dataManager.parseDocument('file:///two.ttl', docTwo, 1);
    cache.updateUri('file:///two.ttl');
    expect(cache.get('ex')).toEqual(new Set(['Person', 'Alice', 'knows', 'Bob', 'Carol']));

    dataManager.removeParsedData('file:///one.ttl');
    cache.removeUri('file:///one.ttl');
    expect(cache.get('ex')).toEqual(new Set(['Bob', 'knows', 'Carol']));
    expect(cache.getInfo('ex', 'Person')).toBeUndefined();

    dataManager.removeParsedData('file:///two.ttl');
    cache.removeUri('file:///two.ttl');
    expect(cache.get('ex')).toBeUndefined();
  });
});
