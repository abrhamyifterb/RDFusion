/* eslint-disable @typescript-eslint/no-explicit-any */
import { splitTopLevel } from './split-top-level';

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