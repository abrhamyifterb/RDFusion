/* eslint-disable @typescript-eslint/no-explicit-any */
import { Quad, DataFactory } from 'n3';
const { namedNode, blankNode, literal, quad, defaultGraph } = DataFactory;

function normalizeDatatype(dt: string): string {
  const xsdNs = "http://www.w3.org/2001/XMLSchema#";
  if (dt.toLowerCase().startsWith(xsdNs.toLowerCase())) {
    return xsdNs + dt.slice(xsdNs.length);
  }
  return dt;
}

interface Position {
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export class TurtleCstToQuadsVisitor {
  namespaces: Record<string, string>;
  tokens: any[];
  quads: Quad[];
  blankNodeCounter: number;
  base: string | null;

  constructor(namespaces: Record<string, string> = {}) {
    this.namespaces = namespaces;
    this.tokens = [];
    this.quads = [];
    this.blankNodeCounter = 0;
    this.base = null;
  }

  private newBlankNodeLabel(): string {
    const randomPart = Math.random().toString(36).slice(2, 5);
    return `b_${this.blankNodeCounter++}_${randomPart}`;
  }

  private getTokenPosition(token: any): Position {
    return {
      startLine: token.startLine,
      startColumn: token.startColumn,
      endLine: token.endLine,
      endColumn: token.endColumn,
    };
  }

  extractTokens(cst: any): any[] {
    const tokens: any[] = [];
    if (cst?.image && cst?.startOffset !== undefined && cst?.tokenType) {
      tokens.push({
        image: cst.image,
        type: cst.tokenType.tokenName,
        startOffset: cst.startOffset,
        endOffset: cst.endOffset,
        startLine: cst.startLine,
        endLine: cst.endLine,
        startColumn: cst.startColumn,
        endColumn: cst.endColumn,
      });
    }
    if (cst?.children) {
      Object.values(cst.children).forEach((childArr: any) => {
        if (Array.isArray(childArr)) {
          childArr.forEach(child => tokens.push(...this.extractTokens(child)));
        }
      });
    }
    return tokens;
  }

  public visitTurtleDoc(cst: any): Quad[] {
    this.tokens = this.extractTokens(cst);
    if (cst.children?.statement) {
      cst.children.statement.forEach((stmt: any) => this.visitStatement(stmt));
    }
    return this.quads;
  }

  private visitStatement(statement: any): void {
    try{
    if (statement.children.directive) {
      this.visitDirective(statement.children.directive[0]);
    } else if (statement.children.triples) {
      statement.children.triples.forEach((triple: any) => {
        if (!triple.children.subject) {
          if (triple.children.blankNodePropertyList) {
            triple.children.subject = triple.children.blankNodePropertyList;
            delete triple.children.blankNodePropertyList;
          } 
          else if (triple.children.collection) {
            triple.children.subject = triple.children.collection;
            delete triple.children.collection;
          }
        }
        this.visitTriple(triple);
      });
    }
  } catch (error: any) {
    console.dir(`[GROUP] Subject node error for statement ====> ${JSON.stringify(error)}`);
  }
  }
  
  private visitDirective(directive: any): void {
    if (directive.children.prefixID) {this.visitPrefixID(directive.children.prefixID[0]);}
    if (directive.children.base) {this.visitBase(directive.children.base[0]);}
  }

  private visitBase(baseNode: any): void {
    const iriToken = baseNode.children.IRIREF[0];
    const iri = iriToken.image.slice(1, -1).trim().replace(/>$/, '');
    this.base = iri;
  }

  private visitPrefixID(prefixID: any): void {
    const pnameNs = prefixID.children.PNAME_NS[0].image.slice(0, -1);
    let iri = prefixID.children.IRIREF[0].image.slice(1, -1).trim().replace(/>$/, '');
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(iri) && this.base) {
      try { iri = new URL(iri, this.base!).toString(); } catch {/**/}
    }
    this.namespaces[pnameNs] = iri;
  }

  private extractPosition(node: any): Position {
    if (node.startLine !== undefined && node.startColumn !== undefined) {
      return this.getTokenPosition(node);
    }
    if (node.children?.LBRACK) {
      return this.getTokenPosition(node.children.LBRACK[0]);
    }
    if (node.children?.LPAREN) {
      return this.getTokenPosition(node.children.LPAREN[0]);
    }
    if (node.children) {
      for (const key of Object.keys(node.children)) {
        const arr = node.children[key];
        if (Array.isArray(arr)) {
          for (const child of arr) {
            const pos = this.extractPosition(child);
            if (pos.startLine !== undefined) {return pos;}
          }
        }
      }
    }
    return {};
  }

  private visitSubject(node: any): any {
    if (node.children.collection) {
      // console.dir(`[GROUP] Subject node of Collection ${JSON.stringify(node.children.collection)}`);
      return this.visitCollection(node.children.collection[0]);
    }
    if (node.name === "collection") {
      return this.visitCollection(node);
    }
    if (node.children.blankNodePropertyList) {
      // console.dir(`[GROUP] Subject node of propertylist ${JSON.stringify(node.children.blankNodePropertyList)}`);
      return this.visitBlankNodePropertyList(node.children.blankNodePropertyList[0]);
    }
    if (node.name === "blankNodePropertyList") {
      return this.visitBlankNodePropertyList(node);
    }
    return this.extractTerm(node);
  }

  private visitTriple(triple: any): void {
    try{
      const subjNode = triple.children.subject[0];
      // console.dir(`[GROUP] Subject node modified lets see => ${JSON.stringify(subjNode)}`);
      const subject = this.visitSubject(subjNode);
      const pos = this.extractPosition(subjNode);

      triple.children.predicateObjectList.forEach((po: any) => {
        const pairs = this.visitPredicateObjectList(po);
        pairs.forEach(pair => {
          pair.objects.forEach(obj => {
            const q = quad(subject, pair.predicate, obj, defaultGraph());
            (q as any).positionToken = pos;
            this.quads.push(q);
          });
        });
      });
    } catch (error: any) {
      console.dir(`[GROUP] Subject node error ====> ${JSON.stringify(error)}`);
    }
  }

  private visitPredicateObjectList(poList: any): { predicate: any; objects: any[] }[] {
    const result: { predicate: any; objects: any[] }[] = [];
    try {
    const verbs = poList.children.verb || [];
    const objLists = poList.children.objectList || [];

    verbs.forEach((verbNode: any, idx: number) => {
      let predicate;
      if (verbNode.children.A) {
        predicate = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      } else if (verbNode.children.predicate) {
        predicate = this.extractTerm(verbNode.children.predicate[0]);
      } else {
        throw new Error('Unknown verb type');
      }

      const objects: any[] = [];
      objLists[idx]?.children.object?.forEach((objNode: any) => {
        objects.push(this.extractTerm(objNode));
      });

      result.push({ predicate, objects });
    });
  } catch (error: any) {
    console.dir(`[GROUP] Subject node error visitPredicateObjectList ====> ${JSON.stringify(error)}`);
  }
    return result;
  }

  private extractTerm(node: any): any {
    if (node.children.iri) {return this.visitIri(node.children.iri[0]);}
    if (node.children.BlankNode) {return this.visitBlankNode(node.children.BlankNode[0]);}
    if (node.children.literal) {return this.visitLiteral(node.children.literal[0]);}
    if (node.children.collection) {return this.visitCollection(node.children.collection[0]);}
    if (node.children.blankNodePropertyList) {return this.visitBlankNodePropertyList(node.children.blankNodePropertyList[0]);}
    throw new Error('Unknown term type');
  }

  private visitIri(iriNode: any): any {
    if (iriNode.children.IRIREF) {
      let iri = iriNode.children.IRIREF[0].image.slice(1, -1).trim().replace(/>$/, '');
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(iri) && this.base) {
        try { iri = new URL(iri, this.base!).toString(); } catch {/**/}
      }
      return namedNode(iri);
    }

    const pNode = iriNode.children.PrefixedName[0];
    const token = pNode.children.PNAME_LN?.[0] || pNode.children.PNAME_NS?.[0];
    const [prefix, local] = token.image.split(':');
    const ns = this.namespaces[prefix];
    if (!ns) {throw new Error(`Undefined prefix: ${prefix}`);}
    return namedNode(ns + local);
  }

  private visitBlankNode(node: any): any {
    if (node.children.ANON) {
      return blankNode(this.newBlankNodeLabel());
    }
    
    const token = node.children.BLANK_NODE_LABEL?.[0] || node.children.ANON?.[0];
    const label = token.image.startsWith('_:') ? token.image.slice(2) : token.image;
    return blankNode(label);
  }

  private visitLiteral(litNode: any): any {
    if (litNode.children.RDFLiteral) {return this.visitRDFLiteral(litNode.children.RDFLiteral[0]);}
    if (litNode.children.BooleanLiteral?.length) {
      const tok = litNode.children.BooleanLiteral[0];
      const val = tok.children.TRUE ? 'true' : tok.children.FALSE ? 'false' : tok.image;
      return literal(val, namedNode('http://www.w3.org/2001/XMLSchema#boolean'));
    }
    if (litNode.children.NumericLiteral) {
      const numNode = litNode.children.NumericLiteral[0];
      const tok = numNode.children.INTEGER?.[0] || numNode.children.DECIMAL?.[0] || numNode.children.DOUBLE?.[0];
      const val = tok.image;
      const dtype = numNode.children.INTEGER ? 'integer' : numNode.children.DECIMAL ? 'decimal' : 'double';
      return literal(val, namedNode(`http://www.w3.org/2001/XMLSchema#${dtype}`));
    }
    throw new Error('Unrecognized literal');
  }

  private visitRDFLiteral(node: any): any {
    const strNode = node.children.String[0];
    const tok = strNode.children.STRING_LITERAL_QUOTE?.[0]
      || strNode.children.STRING_LITERAL_LONG_QUOTE?.[0]
      || strNode.children.STRING_LITERAL_SINGLE_QUOTE?.[0];
    const text = tok.image.slice(1, -1);

    if (node.children.DoubleCaret) {
      const dtTerm = this.visitIri(node.children.iri[0]);
      const dt = normalizeDatatype(dtTerm.value);
      return dt.endsWith('#string') ? literal(text) : literal(text, namedNode(dt));
    }
    if (node.children.LANGTAG) {
      const tag = node.children.LANGTAG[0].image.slice(1);
      return /^https?:\/\//.test(tag)
        ? literal(text, namedNode(normalizeDatatype(tag)))
        : literal(text, tag);
    }
    return literal(text);
  }

  visitCollection(collectionNode: any): any {
    //console.dir(`Collection => ${JSON.stringify(collectionNode)}`);
  
    const items: any[]     = [];
    const posTokens: any[] = [];
  
    for (const objNode of collectionNode.children.object || []) {
      const posSource =
        objNode.children.iri?.[0]                    
        ?? objNode.children.collection?.[0]           
        ?? objNode.children.blankNodePropertyList?.[0]
        ?? objNode;
  
      posTokens.push(this.extractPosition(posSource));
      items.push(this.extractTerm(objNode));
    }
  
    const RDF_FIRST = namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#first");
    const RDF_REST  = namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest");
    const RDF_NIL   = namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#nil");
  
    if (items.length === 0) {return RDF_NIL as any;}
  
    const head    = blankNode(this.newBlankNodeLabel());
    let current = head;
  
    items.forEach((obj, i) => {
      let q = quad(current, RDF_FIRST, obj, defaultGraph());
      (q as any).positionToken = posTokens[i];
      this.quads.push(q);
  
      if (i === items.length - 1) {
        q = quad(current, RDF_REST, RDF_NIL, defaultGraph());
      } else {
        const next = blankNode(this.newBlankNodeLabel());
        q = quad(current, RDF_REST, next, defaultGraph());
        current = next;
      }
      (q as any).positionToken = posTokens[i];
      this.quads.push(q);
    });
  
    return head;
  }
  
  private visitBlankNodePropertyList(bnpl: any): any {
    const predicateObjectLists = bnpl.children.predicateObjectList;
    const node = blankNode(this.newBlankNodeLabel());

    if (!predicateObjectLists || predicateObjectLists.length === 0) {
      return node;
    }

    predicateObjectLists.forEach((po: any) => {
      const pairs = this.visitPredicateObjectList(po);
      const pos = this.extractPosition(po.children.objectList[0]);
      pairs.forEach(pair => {
        pair.objects.forEach(obj => {
          const q = quad(node, pair.predicate, obj, defaultGraph());
          (q as any).positionToken = pos;
          this.quads.push(q);
        });
      });
    });
    return node;
  }
}
