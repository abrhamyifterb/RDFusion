import { describe, expect, it, vi } from 'vitest';
import type { Connection, TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PrefixRegistry } from '../../../business/autocomplete/prefix/prefix-registry';
import { GroupBySubjectCommand } from '../../../business/triple-management/grouping/group-by-subject-command';
import { TurtleFormatterCommand } from '../../../business/triple-management/formatting/turtle/turtle-formatter-command';
import { TurtleFormatter } from '../../../business/triple-management/formatting/turtle/turtle-formatter';
import type { DataManager } from '../../../data/data-manager';
import MillianRDFParser from '../../../data/turtle/ttl-parser';
import type { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';

const formattingConfig = {
  indentSize: 2,
  useUntypedNumeric: true,
  useKnownPrefixes: false,
  compactSingletonLists: true,
  breakPredicates: true,
  breakObjects: false,
  breakSubject: true,
  blankLineBetweenSubjects: true,
  breakPredObj: true,
};

const registry = { getAll: () => [] } as unknown as PrefixRegistry;

describe('TurtleFormatter comments', () => {
  it('preserves every comment exactly once and keeps subject comments nearby', async () => {
    const source = [
      '# document comment',
      '@prefix ex: <http://example.com/> .',
      '',
      '# first subject',
      'ex:first ex:p ex:o ; # inline explanation',
      '  # predicate explanation',
      '  ex:q ex:r .',
      '',
      '# second subject',
      'ex:second ex:p ex:o .',
      '# footer comment',
    ].join('\n');
    const parser = new MillianRDFParser();
    const parsed = await parser.parse(source);

    const output = await new TurtleFormatter().format(parsed, registry, formattingConfig, source);
    const reparsed = await parser.parse(output);

    expect(reparsed.errors).toHaveLength(0);
    expect(reparsed.comments?.map(comment => comment.image)).toEqual(
      parsed.comments?.map(comment => comment.image),
    );
    expect(output.indexOf('# document comment')).toBeLessThan(output.indexOf('@prefix'));
    expect(output.indexOf('# first subject')).toBeLessThan(output.indexOf('ex:first'));
    expect(output.indexOf('# second subject')).toBeLessThan(output.indexOf('ex:second'));
    expect(output.trimEnd().endsWith('# footer comment')).toBe(true);
  });

  it('does not create comments from hashes inside IRIs and literals', async () => {
    const source = [
      '@prefix ex: <http://example.com/#> .',
      'ex:s ex:p "not # a comment" .',
    ].join('\n');
    const parser = new MillianRDFParser();
    const parsed = await parser.parse(source);

    const output = await new TurtleFormatter().format(parsed, registry, formattingConfig, source);
    const reparsed = await parser.parse(output);

    expect(parsed.comments).toEqual([]);
    expect(reparsed.comments).toEqual([]);
    expect(reparsed.errors).toHaveLength(0);
  });

  it.each([
    ['between predicates', '@prefix ex: <http://example.com/> .\nex:s ex:p ex:o ;\n  # predicate note\n  ex:q ex:r .'],
    ['inside a list', '@prefix ex: <http://example.com/> .\nex:s ex:p ( ex:a\n  # list note\n  ex:b ) .'],
    ['inside a blank node', '@prefix ex: <http://example.com/> .\nex:s ex:p [ ex:q ex:a ;\n  # blank-node note\n  ex:r ex:b ] .'],
    ['in a prefix-only document', '# header\n@prefix ex: <http://example.com/> .\n# footer'],
  ])('preserves comments %s', async (_name, source) => {
    const parser = new MillianRDFParser();
    const parsed = await parser.parse(source);

    const output = await new TurtleFormatter().format(parsed, registry, formattingConfig, source);
    const reparsed = await parser.parse(output);

    expect(reparsed.errors).toHaveLength(0);
    expect(reparsed.comments?.map(comment => comment.image).sort()).toEqual(
      parsed.comments?.map(comment => comment.image).sort(),
    );
  });

  it('warns and does not edit when comment formatting is cancelled', async () => {
    const source = '# keep me\n@prefix ex: <http://example.com/> .\nex:s ex:p ex:o .';
    const uri = 'file:///comments.ttl';
    const document = TextDocument.create(uri, 'turtle', 1, source);
    const parsed = await new MillianRDFParser().parse(source);
    const showWarningMessage = vi.fn().mockResolvedValue({ title: 'Cancel' });
    const applyEdit = vi.fn();
    const connection = {
      console: { error: vi.fn() },
      window: { showWarningMessage },
      workspace: { applyEdit },
    } as unknown as Connection;
    const documents = { get: () => document } as unknown as TextDocuments<TextDocument>;
    const dataManager = {
      getSnapshot: () => ({ version: document.version, parsedGraph: parsed }),
    } as unknown as DataManager;
    const settings = {
      turtle: { formatting: formattingConfig },
    } as unknown as RDFusionConfigSettings;
    const command = new TurtleFormatterCommand(dataManager, connection, documents, registry, settings);

    await command.format({ uri });

    expect(showWarningMessage).toHaveBeenCalledOnce();
    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('applies a comment-preserving edit after confirmation', async () => {
    const source = '# keep me\n@prefix ex: <http://example.com/> .\nex:s ex:p ex:o .';
    const uri = 'file:///comments.ttl';
    const document = TextDocument.create(uri, 'turtle', 1, source);
    const parsed = await new MillianRDFParser().parse(source);
    const showWarningMessage = vi.fn().mockResolvedValue({ title: 'Format and preserve comments' });
    const applyEdit = vi.fn().mockResolvedValue({ applied: true });
    const connection = {
      console: { error: vi.fn() },
      window: { showWarningMessage },
      workspace: { applyEdit },
    } as unknown as Connection;
    const documents = { get: () => document } as unknown as TextDocuments<TextDocument>;
    const dataManager = {
      getSnapshot: () => ({ version: document.version, parsedGraph: parsed }),
    } as unknown as DataManager;
    const settings = {
      turtle: { formatting: formattingConfig },
    } as unknown as RDFusionConfigSettings;
    const command = new TurtleFormatterCommand(dataManager, connection, documents, registry, settings);

    await command.format({ uri });

    expect(applyEdit).toHaveBeenCalledOnce();
    const edit = applyEdit.mock.calls[0][0] as { changes: Record<string, { newText: string }[]> };
    expect(edit.changes[uri][0].newText).toContain('# keep me');
  });

  it('preserves multiple repeated comments in the Group By Subject command', async () => {
    const source = [
      '@prefix ex: <http://example.com/> .',
      '# repeated comment',
      '# repeated comment',
      'ex:s ex:p ex:o ;',
      '  # repeated comment',
      '  ex:q ex:r .',
    ].join('\n');
    const uri = 'file:///group-comments.ttl';
    const document = TextDocument.create(uri, 'turtle', 1, source);
    const parser = new MillianRDFParser();
    const parsed = await parser.parse(source);
    const showWarningMessage = vi.fn().mockResolvedValue({ title: 'Group and preserve comments' });
    const applyEdit = vi.fn().mockResolvedValue({ applied: true });
    const connection = {
      console: { error: vi.fn() },
      window: { showWarningMessage },
      workspace: { applyEdit },
    } as unknown as Connection;
    const documents = { get: () => document } as unknown as TextDocuments<TextDocument>;
    const dataManager = {
      getSnapshot: () => ({ version: document.version, parsedGraph: parsed }),
    } as unknown as DataManager;
    const command = new GroupBySubjectCommand(dataManager, connection, documents);

    await command.execute({ uri });

    expect(applyEdit).toHaveBeenCalledOnce();
    const edit = applyEdit.mock.calls[0][0] as { changes: Record<string, { newText: string }[]> };
    const grouped = edit.changes[uri][0].newText;
    const reparsed = await parser.parse(grouped);
    expect(reparsed.comments?.filter(comment => comment.image === '# repeated comment')).toHaveLength(3);
    expect(reparsed.errors).toHaveLength(0);
  });

  it('moves comments from multiple statements above their grouped subject', async () => {
    const source = [
      '@prefix ex: <http://example.com/> .',
      '# comment for the first statement',
      'ex:s ex:first ex:a .',
      '# comment for the second statement',
      'ex:s ex:second ex:b .',
      '# comment for the third statement',
      'ex:s ex:third ex:c .',
    ].join('\n');
    const uri = 'file:///grouped-subject-comments.ttl';
    const document = TextDocument.create(uri, 'turtle', 1, source);
    const parser = new MillianRDFParser();
    const parsed = await parser.parse(source);
    const applyEdit = vi.fn().mockResolvedValue({ applied: true });
    const connection = {
      console: { error: vi.fn() },
      window: { showWarningMessage: vi.fn().mockResolvedValue({ title: 'Group and preserve comments' }) },
      workspace: { applyEdit },
    } as unknown as Connection;
    const documents = { get: () => document } as unknown as TextDocuments<TextDocument>;
    const dataManager = {
      getSnapshot: () => ({ version: document.version, parsedGraph: parsed }),
    } as unknown as DataManager;

    await new GroupBySubjectCommand(dataManager, connection, documents).execute({ uri });

    const edit = applyEdit.mock.calls[0][0] as { changes: Record<string, { newText: string }[]> };
    const grouped = edit.changes[uri][0].newText;
    const subjectIndex = grouped.indexOf('ex:s ');
    const comments = parsed.comments ?? [];
    expect(comments).toHaveLength(3);
    for (const comment of comments) {
      expect(grouped.indexOf(comment.image)).toBeGreaterThanOrEqual(0);
      expect(grouped.indexOf(comment.image)).toBeLessThan(subjectIndex);
    }
    expect(grouped.indexOf(comments[0].image)).toBeLessThan(grouped.indexOf(comments[1].image));
    expect(grouped.indexOf(comments[1].image)).toBeLessThan(grouped.indexOf(comments[2].image));
    expect((await parser.parse(grouped)).errors).toHaveLength(0);
  });
});
