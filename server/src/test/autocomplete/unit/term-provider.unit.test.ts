/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { TermProvider } from '../../../business/autocomplete/term-completion/term-provider';

const fakeSettings = (local:boolean, remote:boolean) => ({
  turtle: {
    autocomplete: { localBased: local, remoteBased: remote },
    validations: { remoteTermVocabulary: true },
  }
} as any);

describe('TermProvider (unit)', () => {
  it('merges local and remote term sets with config toggles', async () => {
    const tp = new TermProvider({} as any, {} as any, fakeSettings(true, true));
    (tp as any).local = { get: () => new Set(['A','B']) };
    (tp as any).remote = { get: async () => new Set(['B','C']) };
    let out = await tp.getTermsFor('ex', {} as any);
    expect(Array.from(out).sort()).toEqual(['A','B','C']);
    tp.updateSettings(fakeSettings(true, false));
    out = await tp.getTermsFor('ex', {} as any);
    expect(Array.from(out).sort()).toEqual(['A','B']);
  });

  it('passes the document namespace IRI to remote term completion so aliases share the same cache', async () => {
    const tp = new TermProvider({} as any, {} as any, fakeSettings(false, true));
    const remoteGet = vi.fn(async () => new Set(['Concept']));
    (tp as any).local = { get: () => new Set() };
    (tp as any).remote = { get: remoteGet };

    const out = await tp.getTermsFor('thes', {} as any, 'http://www.w3.org/2004/02/skos/core#');

    expect(out).toEqual(['Concept']);
    expect(remoteGet).toHaveBeenCalledWith('thes', expect.anything(), 'http://www.w3.org/2004/02/skos/core#');
  });
});
