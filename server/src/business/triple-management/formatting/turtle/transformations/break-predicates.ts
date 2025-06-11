/* eslint-disable @typescript-eslint/no-explicit-any */

export function breakPredicates(lines: string[], cfg: any): string[] {
  if (!cfg.breakPredicates) {return lines;}

  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const hasDot = line.endsWith('.');
    const core   = hasDot ? line.slice(0,-1).trim() : line;

    const segs = splitTopLevel(core, ';');

    segs.forEach((seg, i) => {
      const term = i === segs.length - 1
        ? (hasDot ? ' .' : '')
        : ' ;';

      const text = seg.trim() + term;
      if (i === 0) {out.push(text);}
      else {
        out.push(' '.repeat(cfg.indentSize) + text);
      }
    });
  }
  return out;
}

function splitTopLevel(str: string, sep: string): string[] {
  const parts: string[] = [];
  let buf = '', dp = 0, db = 0;
  for (const ch of str) {
    if (ch==='(') {dp++;}
    else if (ch===')') {dp--;}
    else if (ch==='[') {db++;}
    else if (ch===']') {db--;}
    if (ch===sep && dp===0 && db===0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf.trim());
  return parts;
}
