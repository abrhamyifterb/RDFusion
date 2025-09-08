/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { TextEdit } from 'vscode-languageserver';
import { declarePrefixAtTop } from '../../../business/autocomplete/prefix/turtle/declare-at-top';

describe('declarePrefixAtTop (unit)', () => {
  it('inserts @prefix line when not present', async () => {
    const uri = 'file:///doc.ttl';
    const text = 'ex:a ex:p ex:o .\n';
    const doc = { getText: () => text };
    const applyEdit = vi.fn(async (edit) => {
      const changes = (edit as any).changes[uri] as TextEdit[];
      expect(changes[0].newText.startsWith('@prefix ex: <http://ex/> .')).toBe(true);
    });
    declarePrefixAtTop(uri, 'ex', 'http://ex/', doc, applyEdit as any);
    expect(applyEdit).toHaveBeenCalled();
  });
});
