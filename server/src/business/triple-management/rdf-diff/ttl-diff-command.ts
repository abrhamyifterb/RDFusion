import { Connection, TextDocuments } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IsoPairRequest, DiffRequest, TtlToNQuadsRequest, IsoPairParams, DiffParams, TtlToNQuadsParams } from './protocol';
import { semanticAlignAndDiff } from './alignAndDiff';
import { turtleToNQuads } from './parse';

export class RdfDiffService {
  constructor(private conn: Connection, private docs: TextDocuments<TextDocument>) {}

  register() {
    this.conn.onRequest(IsoPairRequest, async (p: IsoPairParams) => {
      const out = await semanticAlignAndDiff(p.leftTurtle ?? '', p.rightTurtle ?? '', p.baseIRI);
      return { leftAligned: out.leftAligned, rightAligned: out.rightAligned, isIsomorphic: out.isIsomorphic };
    });

    this.conn.onRequest(DiffRequest, async (p: DiffParams) => {
      const out = await semanticAlignAndDiff(p.leftTurtle ?? '', p.rightTurtle ?? '', p.baseIRI);
      return { adds: out.adds, dels: out.dels, isIsomorphic: out.isIsomorphic };
    });

    this.conn.onRequest(TtlToNQuadsRequest, async (p: TtlToNQuadsParams) => {
      const nquads = await turtleToNQuads(p.turtle ?? '', p.baseIRI);
      return { nquads };
    });
  }
}
