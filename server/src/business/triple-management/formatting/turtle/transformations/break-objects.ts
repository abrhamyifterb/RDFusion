import { splitTopLevel } from './split-top-level';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function breakObjects(lines: string[], cfg: any): string[] {
  if (!cfg.breakObjects) {
    return lines;
  }

  const result: string[] = [];
  for (const raw of lines) {
    const indentMatch = raw.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    const trimmed = raw.trim();
    const hasTerm = /[.;]$/.test(trimmed);
    const term = hasTerm ? trimmed.slice(-1) : '';
    const core = hasTerm ? trimmed.slice(0, -1).trimEnd() : trimmed;

    const firstSpace = core.indexOf(' ');
    if (firstSpace < 0) {
      result.push(raw);  
      continue;
    }
    const predicate = core.slice(0, firstSpace);
    const objText   = core.slice(firstSpace + 1);

    const items = splitTopLevel(objText, ',');

    const inline = `${predicate} ${items.join(', ')}${term}`;
    const mustBreak = cfg.breakObjects;

    if (!mustBreak || items.length < 2) {
      result.push(indent + inline);
      continue;
    }
    
    result.push(`${indent}${predicate} ${items[0]},`);
    const continuationIndent = indent + ' '.repeat(predicate.length + 1 + cfg.indentSize);
    for (let i = 1; i < items.length; i++) {
      const sep = i < items.length - 1 ? ',' : term;
      result.push(`${continuationIndent}${items[i]}${sep}`);
    }
  }

  return result;
}