/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection } from 'vscode-languageserver/node';
import { TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DataManager } from '../../../data/data-manager';
import { alignRightToLeftBySignature } from './blank-node';
import { canonURDNA2015, sortLinesUnique } from './canonize';
import { setDiff } from './diff';
import { normalizeLiteralsNQuads } from './literals';
import { turtleToNQuads } from './ttl-to-nquads';

export class RdfDiffService {
  constructor(
    private connection: Connection,
    private documents: TextDocuments<TextDocument>,
    private dataManager: DataManager
  ) {}

  register() {
    this.connection.onRequest('rdf/getNQuads', async (params: { uri: string }) => {
      try {
        const parsed = this.dataManager.getParsedData(params.uri) as { nquads?: string } | undefined;
        const dmNQ = parsed?.nquads ?? '';
        if (dmNQ.trim()) return dmNQ;

        const doc = this.documents.get(params.uri);
        if (!doc) { 
          console.warn(`[rdf/getNQuads] no TextDocument for ${params.uri}`); 
          return null; 
        }
        const text = doc.getText();
        const nq = turtleToNQuads(text, params.uri);
        return nq || null;
      } catch (e: any) {
        console.error(`[rdf/getNQuads] error ${e?.message || e}`); return null;
      }
    });

    this.connection.onRequest('rdf/ttlToNQuads', async (params: { text: string, base?: string }) => {
      try {
        if ((this.dataManager as any)?.ttlToNQuads) {
          const nq = await (this.dataManager as any).ttlToNQuads(params.text, params.base);
          if (nq?.trim()) { return nq; }
        }
        const nq = turtleToNQuads(params.text, params.base);
        return nq || null;
      } catch (e: any) {
        console.error(`[rdf/ttlToNQuads] error ${e?.message || e}`); return null;
      }
    });

    this.connection.onRequest('rdf/canonicalize', async (params: { nquads: string; canonicalizeBNodes?: boolean }) => {
      try {
        const norm = normalizeLiteralsNQuads(params.nquads ?? '');
        let out: string;
        if (params.canonicalizeBNodes) {
          out = await canonURDNA2015(norm, this.connection);
        } else {
          out = sortLinesUnique(norm);
        }
        return out;
      } catch (e: any) {
        console.error(`[rdf/canonicalize] error ${e?.message || e}`);
        return sortLinesUnique(params.nquads ?? '');
      }
    });

    this.connection.onRequest('rdf/canonPair', async (params: {
      left: string; right: string; canonicalizeBNodes?: boolean; alignRightToLeft?: boolean;
    }) => {
      try {
        const Lnorm = normalizeLiteralsNQuads(params.left  ?? '');
        const Rnorm = normalizeLiteralsNQuads(params.right ?? '');
        let Lc: string, Rc: string;

        if (params.canonicalizeBNodes) {
          [Lc, Rc] = await Promise.all([
            canonURDNA2015(Lnorm, this.connection),
            canonURDNA2015(Rnorm, this.connection),
          ]);
          
        } else {
          Lc = sortLinesUnique(Lnorm);
          Rc = sortLinesUnique(Rnorm);
        }

        if (params.canonicalizeBNodes && params.alignRightToLeft) {
          Rc = alignRightToLeftBySignature(Lc, Rc); 
        }

        return { left: Lc, right: Rc };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: any) {
        const L = sortLinesUnique(normalizeLiteralsNQuads(params.left  ?? ''));
        const R = sortLinesUnique(normalizeLiteralsNQuads(params.right ?? ''));
        return { left: L, right: R };
      }
    });

    this.connection.onRequest('rdf/ttlCanonPair', async (params: {
      leftTurtle: string; rightTurtle: string; base?: string;
      canonicalizeBNodes?: boolean; alignRightToLeft?: boolean;
    }) => {
      try {
        const Lnq = turtleToNQuads(params.leftTurtle  ?? '', params.base);
        const Rnq = turtleToNQuads(params.rightTurtle ?? '', params.base);
        return await this.connection.sendRequest<{ left: string; right: string }>('rdf/canonPair', {
          left: Lnq, right: Rnq, canonicalizeBNodes: params.canonicalizeBNodes, alignRightToLeft: params.alignRightToLeft
        });
      } catch (e: any) {
        this.connection.console.error(`[rdf/ttlCanonPair] error ${e?.message || e}`);
        const L = sortLinesUnique(normalizeLiteralsNQuads(turtleToNQuads(params.leftTurtle  ?? '', params.base)));
        const R = sortLinesUnique(normalizeLiteralsNQuads(turtleToNQuads(params.rightTurtle ?? '', params.base)));
        return { left: L, right: R };
      }
    });

    this.connection.onRequest('rdf/diffNQuads', async (params: {
      left: string; right: string; canonicalizeBNodes?: boolean; alignRightToLeft?: boolean
    }) => {
      const { left: Lc, right: Rc } = await this.connection.sendRequest<{ left: string; right: string }>('rdf/canonPair', {
        left: params.left, right: params.right,
        canonicalizeBNodes: params.canonicalizeBNodes,
        alignRightToLeft: params.alignRightToLeft
      }).catch(() => ({
        left: sortLinesUnique(params.left ?? ''),
        right: sortLinesUnique(params.right ?? '')
      }));
      const { adds, dels } = setDiff(Lc, Rc);
      return { adds, dels };
    });
  }
}
