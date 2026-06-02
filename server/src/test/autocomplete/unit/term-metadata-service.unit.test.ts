/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { TermMetadataService } from '../../../business/autocomplete/term-metadata/term-metadata-service';

describe('TermMetadataService', () => {
  it('builds shared hover/completion metadata from selected SHACL guidance without local workspace details', () => {
    const prefixRegistry = { getIri: (prefix: string) => prefix === 'ex' ? 'http://example.com/' : undefined } as any;
    const termProvider = {
      getLocalTermInfo: (prefix: string, term: string) => prefix === 'ex' && term === 'name'
        ? {
            prefix,
            term,
            sourceUris: ['file:///data.ttl'],
            vocabulary: {
              iri: 'http://example.com/name',
              roles: ['property'],
              labels: ['Name'],
              comments: ['Human-readable display name.'],
              types: ['owl:DatatypeProperty'],
              domains: ['ex:Person'],
              ranges: ['xsd:string'],
              subClassOf: [],
              subPropertyOf: ['schema:name'],
              equivalentTerms: [],
              seeAlso: [],
              isDefinedBy: ['ex:Vocabulary'],
              examples: ['ex:Alice'],
              occurrences: { subject: 1, predicate: 3, object: 0 },
            },
          }
        : undefined,
      getRemoteTermInfo: () => undefined,
    } as any;
    let receivedSelection: any;
    const shapeManager = {
      getPropertyMetadataForIri: (iri: string, selection: any) => {
        receivedSelection = selection;
        return iri === 'http://example.com/name' && selection?.mode === 'auto'
          ? [{
              id: 'prop-name',
              path: iri,
              pathDisplay: 'name',
              label: 'Name',
              summary: 'Name is required',
              shapeId: 'PersonShape',
              shapeLabel: 'PersonShape',
              sourceUri: 'file:///shapes.ttl',
              targetDisplays: ['targetClass Person'],
            }]
          : [];
      },
    } as any;

    const service = new TermMetadataService(prefixRegistry, termProvider, shapeManager, () => ({ mode: 'auto' } as any));
    const info = service.getCurieMetadata('ex:name');

    expect(receivedSelection?.mode).toBe('auto');
    expect(info?.iri).toBe('http://example.com/name');
    expect(info?.sources).toContain('prefix');
    expect(info?.sources).not.toContain('local');
    expect(info?.sources).toContain('shacl');
    expect(info?.documentation).not.toContain('Human-readable display name');
    expect(info?.documentation).toContain('SHACL guidance');
    expect(info?.documentation).toContain('Name is required');
    expect(info?.documentation).not.toContain('Seen in');
    expect(info?.documentation).not.toContain('Workspace occurrences');

    const item = service.enrichCompletionItem(
      { label: 'name', kind: CompletionItemKind.Property, insertText: 'name' },
      'ex',
      'name',
    );
    expect(item.detail).toContain('ex:name');
    expect((item.data as any).rdfusionTerm.iri).toBe('http://example.com/name');
    expect(JSON.stringify(item.documentation)).toContain('SHACL guidance');
  });

  it('does not show SHACL guidance outside the active custom SHACL selection', () => {
    const prefixRegistry = { getIri: () => 'http://example.com/' } as any;
    const termProvider = {
      getLocalTermInfo: () => undefined,
      getRemoteTermInfo: () => undefined,
    } as any;
    const shapeManager = {
      getPropertyMetadataForIri: (_iri: string, selection: any) => selection.mode === 'custom'
        ? []
        : [{ label: 'Name', shapeId: 'Shape', shapeLabel: 'Shape', targetDisplays: [] }],
    } as any;

    const service = new TermMetadataService(prefixRegistry, termProvider, shapeManager, () => ({ mode: 'custom', custom: { files: [] } } as any));
    const info = service.getCurieMetadata('ex:name');

    expect(info).toBeUndefined();
  });

  it('uses dereferenced remote vocabulary metadata and does not show workspace usage noise', () => {
    const prefixRegistry = { getIri: () => 'http://example.com/' } as any;
    const termProvider = {
      getLocalTermInfo: () => undefined,
      getRemoteTermInfo: (prefix: string, term: string) => prefix === 'ex' && term === 'knows'
        ? {
            prefix,
            term,
            vocabulary: {
              iri: 'http://example.com/knows',
              roles: ['property'],
              labels: ['knows'],
              comments: ['Relates one resource to another resource.'],
              types: ['owl:ObjectProperty'],
              domains: ['ex:Person'],
              ranges: ['ex:Person'],
              subClassOf: [],
              subPropertyOf: ['schema:knows'],
              equivalentTerms: [],
              seeAlso: ['schema:knows'],
              isDefinedBy: ['ex:Vocabulary'],
              examples: [],
              occurrences: { subject: 0, predicate: 0, object: 0 },
            },
          }
        : undefined,
    } as any;

    const service = new TermMetadataService(prefixRegistry, termProvider);
    const info = service.getCurieMetadata('ex:knows');

    expect(info?.sources).toContain('remote');
    expect(info?.documentation).toContain('remote vocabulary');
    expect(info?.documentation).toContain('Relates one resource');
    expect(info?.documentation).toContain('Domain');
    expect(info?.documentation).toContain('ex:Person');
    expect(info?.documentation).toContain('Range');
    expect(info?.documentation).toContain('Subproperty of');
    expect(info?.documentation).not.toContain('Seen in');
    expect(info?.documentation).not.toContain('Workspace occurrences');
    expect(info?.documentation).not.toContain('Example resources');
  });

  it('uses document namespace options for JSON-LD aliases that are not in the prefix registry', () => {
    const prefixRegistry = { getIri: () => undefined } as any;
    const termProvider = {
      getLocalTermInfo: () => undefined,
      getRemoteTermInfo: (prefix: string, term: string, namespaceIri?: string, syntax?: string) => {
        return prefix === 'thes' && term === 'altLabel' && namespaceIri === 'http://www.w3.org/2004/02/skos/core#' && syntax === 'jsonld'
          ? {
              prefix,
              term,
              vocabulary: {
                iri: `${namespaceIri}${term}`,
                roles: ['property'],
                labels: ['alternative label'],
                comments: ['An alternative lexical label for a resource.'],
                types: ['rdf:Property'],
                domains: [],
                ranges: ['rdf:langString'],
                subClassOf: [],
                subPropertyOf: [],
                equivalentTerms: [],
                seeAlso: [],
                isDefinedBy: [],
                examples: [],
                occurrences: { subject: 0, predicate: 0, object: 0 },
              },
            }
          : undefined;
      },
    } as any;

    const service = new TermMetadataService(prefixRegistry, termProvider);
    const info = service.getCurieMetadata('thes:altLabel', {
      namespaceIri: 'http://www.w3.org/2004/02/skos/core#',
      syntax: 'jsonld',
    });

    expect(info?.iri).toBe('http://www.w3.org/2004/02/skos/core#altLabel');
    expect(info?.sources).toContain('remote');
    expect(info?.documentation).toContain('alternative label');
    expect(info?.documentation).toContain('An alternative lexical label');
    expect(info?.documentation).toContain('Range');
  });


  it('does not expose hover/detail metadata for local workspace-only terms', () => {
    const prefixRegistry = { getIri: () => 'http://example.com/' } as any;
    const termProvider = {
      getLocalTermInfo: (prefix: string, term: string) => prefix === 'ex' && term === 'localOnly'
        ? {
            prefix,
            term,
            sourceUris: ['file:///data.ttl'],
            vocabulary: {
              iri: 'http://example.com/localOnly',
              roles: ['property'],
              labels: ['Local only'],
              comments: ['This local workspace comment should not be shown.'],
              types: ['rdf:Property'],
              domains: ['ex:Thing'],
              ranges: ['xsd:string'],
              subClassOf: [],
              subPropertyOf: [],
              equivalentTerms: [],
              seeAlso: [],
              isDefinedBy: [],
              examples: [],
              occurrences: { subject: 0, predicate: 1, object: 0 },
            },
          }
        : undefined,
      getRemoteTermInfo: () => undefined,
    } as any;

    const service = new TermMetadataService(prefixRegistry, termProvider);

    expect(service.getCurieMetadata('ex:localOnly')).toBeUndefined();
  });

});
