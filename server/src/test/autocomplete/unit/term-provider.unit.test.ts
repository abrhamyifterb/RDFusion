/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { TermProvider } from '../../../business/autocomplete/term-completion/term-provider';

const fakeSettings = (local:boolean, remote:boolean) => ({
  turtle: { autocomplete: { localBased: local, remoteBased: remote } }
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
});
