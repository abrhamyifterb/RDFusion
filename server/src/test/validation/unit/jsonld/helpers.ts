/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseTree, Node } from 'jsonc-parser';

export const parseAst = (text: string): Node => {
  const ast = parseTree(text);
  if (!ast) {throw new Error('AST parse failed');}
  return ast;
};

export const ctxMapFrom = (obj: Record<string, any>): Map<string,string> => {
  const m = new Map<string,string>();
  for (const [k,v] of Object.entries(obj || {})) {
    if (typeof v === 'string') {m.set(k, v);}
  }
  return m;
};
