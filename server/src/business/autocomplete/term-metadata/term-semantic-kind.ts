import { CompletionItemKind } from 'vscode-languageserver/node.js';
import type { TermMetadata, CompletionMetadataOptions } from './term-metadata-service.js';

export type TermSemanticKind = 'shacl-field' | 'property' | 'class' | 'resource' | 'unknown';

export type CompletionRole = NonNullable<CompletionMetadataOptions['role']>;

function hasAnyRole(metadata: TermMetadata | undefined, rolesToCheck: string[]): boolean {
  const roles = metadata?.vocabulary?.roles ?? [];
  const roleSet = new Set<string>(roles);
  return rolesToCheck.some(role => roleSet.has(role));
}

function typeLooksLike(metadata: TermMetadata | undefined, fragments: string[]): boolean {
  const types = metadata?.vocabulary?.types ?? [];
  return types.some(type => fragments.some(fragment => type === fragment || type.endsWith(fragment) || type.includes(fragment)));
}

export function termSemanticKind(metadata?: TermMetadata): TermSemanticKind {
  const hasShaclField = (metadata?.shaclProperties?.length ?? 0) > 0;
  const isProperty = hasShaclField
    || hasAnyRole(metadata, ['property', 'predicate'])
    || typeLooksLike(metadata, ['rdf:Property', 'owl:ObjectProperty', 'owl:DatatypeProperty', 'owl:AnnotationProperty', '#Property']);
  const isClass = hasAnyRole(metadata, ['class'])
    || typeLooksLike(metadata, ['rdfs:Class', 'owl:Class', '#Class']);

  if (hasShaclField) return 'shacl-field';
  if (isProperty) return 'property';
  if (isClass) return 'class';
  if (hasAnyRole(metadata, ['subject', 'object'])) return 'resource';
  return metadata?.vocabulary ? 'resource' : 'unknown';
}

export function completionKindForSemanticRole(role: CompletionRole, metadata?: TermMetadata): CompletionItemKind {
  const kind = termSemanticKind(metadata);
  if (kind === 'shacl-field') {
    return CompletionItemKind.Field;
  }
  if (kind === 'property') {
    return CompletionItemKind.Property;
  }
  if (kind === 'class') {
    return CompletionItemKind.Class;
  }
  if (role === 'object') {
    return CompletionItemKind.Value;
  }
  return CompletionItemKind.Reference;
}

export function isClassOnlyTerm(metadata?: TermMetadata): boolean {
  return termSemanticKind(metadata) === 'class';
}

export function isPropertyOnlyTerm(metadata?: TermMetadata): boolean {
  const kind = termSemanticKind(metadata);
  return kind === 'property' || kind === 'shacl-field';
}

export function roleSortPrefix(score: number): string {
  return String(score).padStart(2, '0');
}
