import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TurtleCompletionContextResolver } from '../../../business/autocomplete/context/turtle-completion-context';

function resolve(text: string, marker = '|') {
  const index = text.indexOf(marker);
  if (index < 0) throw new Error('missing marker');
  const clean = text.slice(0, index) + text.slice(index + marker.length);
  const doc = TextDocument.create('file:///doc.ttl', 'turtle', 1, clean);
  const pos = doc.positionAt(index);
  return new TurtleCompletionContextResolver().resolve(doc, pos);
}

describe('TurtleCompletionContextResolver', () => {
  it('detects subject, predicate, and object positions', () => {
    expect(resolve('ex:|').role).toBe('subject');
    expect(resolve('ex:Alice ex:|').role).toBe('predicate');
    expect(resolve('ex:Alice ex:name ex:|').role).toBe('object');
  });

  it('resets to predicate after semicolon and object after comma', () => {
    expect(resolve('ex:Alice ex:name "Alice" ; ex:|').role).toBe('predicate');
    expect(resolve('ex:Alice ex:knows ex:Bob, ex:|').role).toBe('object');
  });

  it('detects prefix declarations, comments, and literals', () => {
    expect(resolve('@prefix ex: |').role).toBe('prefix');
    expect(resolve('ex:a ex:p ex:o . # ex:|').role).toBe('comment');
    expect(resolve('ex:a ex:p "ex:|" .').role).toBe('literal');
  });
});
