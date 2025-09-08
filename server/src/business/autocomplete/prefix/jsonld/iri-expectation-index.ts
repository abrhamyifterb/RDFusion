/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node } from 'jsonc-parser';

function textSlice(text: string, n: Node) {
  return text.slice(n.offset, n.offset + n.length);
}
function parseStr(text: string, n?: Node): string | null {
  if (!n || n.type !== 'string') return null;
  try { return JSON.parse(textSlice(text, n)); } catch { return null; }
}
interface Span { start: number; end: number }

export class IriExpectationIndex {
  private text!: string;
  private ast!: Node;

  private contextSpans: Span[] = [];
  private iriValueStringNodes = new Set<Node>();

  private activeTermsByObject = new WeakMap<Node, Set<string>>();

  init(ctx: { text: string; ast: Node }) {
    this.text = ctx.text;
    this.ast  = ctx.ast;

    this.contextSpans = [];
    this.iriValueStringNodes.clear();
    this.activeTermsByObject = new WeakMap();

    this.walk(this.ast, n => {
      if (n.type === 'property' && n.children?.length === 2) {
        const k = parseStr(this.text, n.children[0]);
        if (k === '@context') {
          const v = n.children[1];
          this.contextSpans.push({ start: v.offset, end: v.offset + v.length });
        }
      }
    });

    this.walkWithActive(this.ast, new Set<string>(), new Set<string>());
  }

  keyIsIriExpected(keyNode: Node): boolean {
    const parent = keyNode.parent;
    if (!parent || parent.type !== 'property' || parent.children?.[0] !== keyNode) return false;

    const keyStr = parseStr(this.text, keyNode);
    if (!keyStr || keyStr.startsWith('@')) return false;

    const off = keyNode.offset;
    for (const s of this.contextSpans) {
      if (off >= s.start && off < s.end) return false;
    }
    return true;
  }

  isIriValueStringNode(n: Node): boolean {
    return this.iriValueStringNodes.has(n);
  }

  looksAbsoluteIri(str: string, atNode: Node): boolean {
    if (/^[A-Za-z][A-Za-z0-9+.\-]*:\/\//.test(str)) return true;

    const m = /^([A-Za-z][A-Za-z0-9+.\-]*):/.exec(str);
    if (!m) return false;

    const candidate = m[1];
    const terms = this.activeTermsAt(atNode);
    if (terms.has(candidate)) return false;
    return true;
  }

  activeTermsAt(node: Node): Set<string> {
    let cur: Node | undefined = node;
    while (cur && cur.type !== 'object') cur = cur.parent;
    return (cur && this.activeTermsByObject.get(cur)) || new Set<string>();
  }


  private walk(n: Node, cb: (n: Node) => void) {
    cb(n);
    n.children?.forEach(ch => this.walk(ch, cb));
  }

  private walkWithActive(n: Node, inheritedCoercions: Set<string>, inheritedTerms: Set<string>) {
    if (n.type === 'object') {

      const activeCoercions = new Set(inheritedCoercions);
      const activeTerms     = new Set(inheritedTerms);

      this.applyLocalContext(n, activeCoercions, activeTerms);

      this.activeTermsByObject.set(n, activeTerms);

      for (const prop of n.children ?? []) {
        if (prop.type !== 'property' || prop.children?.length !== 2) continue;
        const [kNode, vNode] = prop.children!;
        const k = parseStr(this.text, kNode);

        if (k === '@id' || k === '@type') {
          this.markIriValueStrings(vNode);        
          this.walkWithActive(vNode, activeCoercions, activeTerms);
          continue;
        }
        if (k === '@context') {
          this.walkWithActive(vNode, activeCoercions, activeTerms);
          continue;
        }

        if (k && activeCoercions.has(k)) {
          this.markIriValueStrings(vNode);
          this.markEmbeddedIdStrings(vNode);
        }

        this.walkWithActive(vNode, activeCoercions, activeTerms);
      }
      return;
    }

    if (n.type === 'array') {
      for (const ch of n.children ?? []) {this.walkWithActive(ch, inheritedCoercions, inheritedTerms);}
      return;
    }
  }

  private applyLocalContext(obj: Node, activeCoercions: Set<string>, activeTerms: Set<string>) {
    const ctxProps = (obj.children ?? []).filter(p =>
      p.type === 'property' && p.children?.length === 2 &&
      parseStr(this.text, p.children![0]) === '@context'
    );
    if (!ctxProps.length) return;

    for (const ctxProp of ctxProps) {
      const v = ctxProp.children![1];

      if (v.type === 'object') {
        this.applyCtxObject(v, activeCoercions, activeTerms);
      } else if (v.type === 'array') {

        for (const item of v.children ?? []) {
          if (item.type === 'object') {this.applyCtxObject(item, activeCoercions, activeTerms);}
        }
      } else {
        // 
      }
    }
  }

  private applyCtxObject(ctxObj: Node, activeCoercions: Set<string>, activeTerms: Set<string>) {
    for (const prop of ctxObj.children ?? []) {
      if (prop.type !== 'property' || prop.children?.length !== 2) continue;
      const [termNode, defNode] = prop.children!;
      const term = parseStr(this.text, termNode);
      if (!term) continue;

      if (defNode.type === 'null') {
        activeCoercions.delete(term);
        activeTerms.delete(term);
        continue;
      }

      activeTerms.add(term);

      if (defNode.type === 'object') {
        let coerces = false;
        for (const inner of defNode.children ?? []) {
          if (inner.type !== 'property' || inner.children?.length !== 2) continue;
          const [ik, iv] = inner.children!;
          const ikStr = parseStr(this.text, ik);
          if (ikStr !== '@type') continue;

          if (iv.type === 'string') {
            const t = parseStr(this.text, iv);
            coerces = (t === '@id' || t === '@vocab');
          } else if (iv.type === 'array') {
            coerces = (iv.children ?? []).some(c => {
              const t = parseStr(this.text, c);
              return t === '@id' || t === '@vocab';
            });
          }
        }
        if (coerces) activeCoercions.add(term); else activeCoercions.delete(term);
      } else {
        activeCoercions.delete(term);
      }
    }
  }

  private markIriValueStrings(vNode: Node) {
    if (vNode.type === 'string') {
      this.iriValueStringNodes.add(vNode);
    } else if (vNode.type === 'array') {
      for (const ch of vNode.children ?? []) {
        if (ch.type === 'string') this.iriValueStringNodes.add(ch);
      }
    }
  }

  private markEmbeddedIdStrings(vNode: Node) {
    if (vNode.type === 'object') {
      for (const p of vNode.children ?? []) {
        if (p.type !== 'property' || p.children?.length !== 2) continue;
        const [k, v] = p.children!;
        if (parseStr(this.text, k) === '@id' && v.type === 'string') {
          this.iriValueStringNodes.add(v);
        }
      }
    } else if (vNode.type === 'array') {
      for (const item of vNode.children ?? []) {
        if (item.type !== 'object') continue;
        for (const p of item.children ?? []) {
          if (p.type !== 'property' || p.children?.length !== 2) continue;
          const [k, v] = p.children!;
          if (parseStr(this.text, k) === '@id' && v.type === 'string') {
            this.iriValueStringNodes.add(v);
          }
        }
      }
    }
  }
}
