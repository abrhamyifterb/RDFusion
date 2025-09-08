/* eslint-disable @typescript-eslint/no-explicit-any */
import { splitTopLevel } from './split-top-level';

export function breakPredicates(
  lines: string[],
  cfg: { breakPredicates: boolean; indentSize: number }
): string[] {
  if (!cfg.breakPredicates) {
    return lines;
  }

  const out: string[] = [];
  for (const raw of lines) {
    const indentMatch = raw.match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1] : '';

    const trimmed = raw.trim();
    const hasTerm = /[.;]$/.test(trimmed);
    const termChar = hasTerm ? trimmed.slice(-1) : '';
    const core    = hasTerm ? trimmed.slice(0, -1).trimEnd() : trimmed;

    const parts = splitTopLevel(core, ';');

    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const sep = isLast 
        ? (termChar === ';' ? ';' : termChar || '') 
        : ';';

      const prefix = i === 0 
        ? baseIndent 
        : baseIndent + ' '.repeat(cfg.indentSize);

      out.push(prefix + part.trim() + sep);
    });
  }

  return out;
}