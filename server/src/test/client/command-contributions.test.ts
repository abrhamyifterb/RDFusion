import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
) as {
  contributes: {
    commands: Array<{ command: string; title: string; enablement?: string }>;
    menus?: { commandPalette?: Array<{ command: string; when?: string }> };
  };
};

const commands = new Map(
  packageJson.contributes.commands.map((command) => [command.command, command]),
);

function command(id: string) {
  const found = commands.get(id);
  if (!found) {
    throw new Error(`Missing contributed command ${id}`);
  }
  return found;
}

describe('VS Code command contributions', () => {
  it('limits active-editor RDF graph commands to Turtle and JSON-LD documents', () => {
    const rdfEditorEnablement = 'editorLangId == turtle || editorLangId == jsonld';

    for (const id of [
      'rdfusion.filterTriples',
      'rdfusion.filterTriplesBySubject',
      'rdfusion.filterTriplesByPredicate',
      'rdfusion.filterTriplesByObject',
      'rdfusion.generateVoID',
    ]) {
      expect(command(id).enablement).toBe(rdfEditorEnablement);
    }
  });

  it('keeps Turtle-only commands limited to Turtle documents', () => {
    for (const id of [
      'rdfusion.formatTriples',
      'rdfusion.groupBySubject',
      'rdfusion.sortBySubjectAsc',
      'rdfusion.sortBySubjectDesc',
      'rdfusion.sortByPredicateAsc',
      'rdfusion.sortByPredicateDesc',
      'rdfusion.compareWithRef',
      'rdfusion.encodeTurtleUnicodeEscapes',
      'rdfusion.decodeTurtleUnicodeEscapes',
    ]) {
      expect(command(id).enablement).toBe('editorLangId == turtle');
    }
  });


  it('keeps SCM row command clickable outside the active editor language context', () => {
    expect(command('rdfusion.compareWithHEAD').enablement).toBeUndefined();
  });

  it('keeps JSON-LD-only commands limited to JSON-LD documents', () => {
    for (const id of [
      'rdfusion.compactJsonld',
      'rdfusion.expandJsonld',
      'rdfusion.flattenJsonld',
      'rdfusion.frameJsonld',
    ]) {
      expect(command(id).enablement).toBe('editorLangId == jsonld');
    }
  });

  it('keeps internal implementation commands out of the command palette', () => {
    const hidden = new Map(
      (packageJson.contributes.menus?.commandPalette ?? []).map((entry) => [
        entry.command,
        entry.when,
      ]),
    );

    expect(hidden.get('jsonld.applyPrefixAndRename')).toBe('false');
    expect(hidden.get('rdfusion.toggleOneIri')).toBe('false');
  });
});
