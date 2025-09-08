/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Q } from './helpers';
import { VoIDGenerator } from '../../../business/triple-management/void-generate/void-generate';

describe('VoIDGenerator (Unit test)', () => {
  it('summarizes triples, properties and vocabularies', () => {
    const parsed: any = {
      quads: [
        Q.quad(Q.namedNode('http://ex/a'), Q.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), Q.namedNode('http://ex/Person')),
        Q.quad(Q.namedNode('http://ex/a'), Q.namedNode('http://ex/name'), Q.literal('Homer')),
        Q.quad(Q.namedNode('http://ex/b'), Q.namedNode('http://ex/knows'), Q.namedNode('http://ex/a'))
      ],
      prefixes: { ex: 'http://ex/' },
      tokens: []
    };
    const gen = new VoIDGenerator();
    const ttl = gen.generateVoID(parsed);
    expect(/void:triples\s+3\b/.test(ttl)).toBe(true);
    expect(/void:properties\s+3\b/.test(ttl)).toBe(true);
    expect(/void:vocabulary\s+<http:\/\/ex\/>/.test(ttl)).toBe(true);
  });
});
