/* eslint-disable @typescript-eslint/no-explicit-any */
import { Term } from 'n3';
import { JsonldParsedGraph, ParsedGraph } from '../../../../data/irdf-parser';
import { SubjectIndex } from './subject-index.js';

const RDF = {
  type:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  first: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first',
  rest:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest',
  nil:   'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
};

export class GroupFormatter {
  private subjIndex = new SubjectIndex();

  public group(graph: ParsedGraph | JsonldParsedGraph): string {
    const quads = graph.quads;

    const prefixes: Record<string,string> = {};
    if ('prefixes' in graph && graph.prefixes) {
      Object.assign(prefixes, graph.prefixes);
    }
    if ('contextMap' in graph && graph.contextMap) {
      for (const [key, uri] of graph.contextMap.entries()) {
        prefixes[key] = uri;
      }
    }

    const out: string[] = [];

    Object.entries(prefixes)
      .sort(([a],[b]) => a.localeCompare(b))
      .forEach(([pfx,uri]) => out.push(`@prefix ${pfx}: <${uri}> .`));
    out.push('');

    const allListHeads = new Set<string>();
    for (const q of quads) {
      if (q.predicate.value === RDF.first) {
        allListHeads.add(q.subject.value);
      }
    }

    const fullListMap = new Map<string,Term[]>();
    for (const head of allListHeads) {
      let cur = head;
      const items: Term[] = [];
      while (true) {
        const f = quads.find(x => x.subject.value===cur && x.predicate.value===RDF.first);
        if (!f) break;
        items.push(f.object as Term);
        const r = quads.find(x => x.subject.value===cur && x.predicate.value===RDF.rest);
        if (!r || r.object.value===RDF.nil) break;
        cur = r.object.value;
      }
      fullListMap.set(head, items);
    }

    const objBnodes = new Set(
      quads
        .filter(q => q.object.termType==='BlankNode')
        .map(q => (q.object as Term).value)
    );

    const inlineLists = new Set(
      Array.from(allListHeads).filter(id => objBnodes.has(id))
    );

    const specialListSubjects = new Set(
      Array.from(allListHeads).filter(id =>
        quads.some(q =>
          q.subject.value===id &&
          q.predicate.value !== RDF.first &&
          q.predicate.value !== RDF.rest
        )
      )
    );

    const propListIds = new Set<string>(
      quads
        .filter(q => q.object.termType==='BlankNode')
        .map(q => (q.object as Term).value)
        .filter(id => quads.some(q2 => q2.subject.value===id))
    );

    const listHeads = new Set(
      quads.filter(q => q.predicate.value === RDF.first)
        .map(q => q.subject.value)
    );
    
    const toRemove = quads.filter(q =>
      listHeads.has(q.subject.value) &&
      (q.predicate.value === RDF.first ||
        q.predicate.value === RDF.rest)
    );

    this.subjIndex.applyDelta({ removed: toRemove, added: [] });

    const abbr = (uri: string) => {
      for (const [p,b] of Object.entries(prefixes)) {
        if (uri.startsWith(b)) {
          const local = uri.slice(b.length);
          // eslint-disable-next-line no-useless-escape
          if(/^[A-Za-z_][A-Za-z0-9._\-]*$/.test(local))
          {
            return `${p}:${local}`;
          }
        }
      }
      return `<${uri}>`;
    };

    const render = (t: Term): string => {
      if (t.termType==='NamedNode') {return abbr(t.value);}

      if (t.termType==='BlankNode') {
        const id = t.value;

        if (inlineLists.has(id)) {
          const items = fullListMap.get(id)!;
          return `( ${items.map(render).join(' ')} )`;
        }

        if (propListIds.has(id)) {
          const bnQuads = quads.filter(x=>x.subject.value===id);
          const inner   = bnQuads.map(pq => {
            const pk = pq.predicate.value===RDF.type
              ? 'a'
              : abbr(pq.predicate.value);
            return `${pk} ${render(pq.object as Term)}`;
          }).join(' ; ');
          return `[ ${inner} ]`;
        }

        if (specialListSubjects.has(id)) {
          const items = fullListMap.get(id)!;
          return `( ${items.map(render).join(' ')} )`;
        }

        return `_:${id}`;
      }

      let lit = `"${t.value}"`;
      const litLang = (t as any).language;
      const litDatatype = (t as any).datatype.value;

      if (litLang) {
        lit += `@${(t as any).language}`;
        return lit;
      }

      if (litDatatype === `${prefixes['xsd']}string` || litDatatype === '') {
        return lit;
      }

      return `${lit}^^${abbr(litDatatype)}`;
    };

    const subjects = Array.from(new Set(quads.map(q=>q.subject.value)))
      .filter(id =>
        !inlineLists.has(id) &&
        !propListIds.has(id)  &&
        !specialListSubjects.has(id)
      );

    for (const id of subjects) {
      const triples = this.subjIndex.getBySubject(id, graph);
      if (!triples.length) {continue;}

      const subjText = render(triples[0].subject);
      let block = `${subjText} `;

      const byPred = new Map<string,Term[]>();
      for (const q of triples) {
        const key = q.predicate.value===RDF.type ? 'a' : q.predicate.value;
        byPred.set(key,(byPred.get(key)||[]).concat(q.object as Term));
      }

      const entries = Array.from(byPred.entries());
      entries.forEach(([pk,objs],i) => {
        const pred = pk==='a' ? 'a' : abbr(pk);

        const seen = new Set<string>();
        const unique = objs.filter(o => {
          const rep = render(o);
          if (seen.has(rep)) {return false;}
          seen.add(rep);
          return true;
        });

        const txts = unique.map(render).join(', ');
        const sep  = i===entries.length-1 ? '.' : ';';
        block += `${pred} ${txts} ${sep}\n  `;
      });

      out.push(block.trim(), '');
    }

    for (const id of Array.from(specialListSubjects)) {
      const items    = fullListMap.get(id)!;
      const subjText = `( ${items.map(render).join(' ')} )`;

      const others = quads.filter(q =>
        q.subject.value===id &&
        q.predicate.value!==RDF.first &&
        q.predicate.value!==RDF.rest
      );
      for (const q of others) {
        const pred = q.predicate.value===RDF.type
          ? 'a'
          : abbr(q.predicate.value);
        out.push(`${subjText} ${pred} ${render(q.object as Term)} .`);
      }
      out.push('');
    }

    return out.join('\n').trim() + '\n';
  }
}
