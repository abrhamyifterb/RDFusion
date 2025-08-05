/* eslint-disable @typescript-eslint/no-explicit-any */
import { splitTopLevel } from './split-top-level';

export function breakPredObj(
  lines: string[],
  cfg: any
): string[] {
  if(!cfg.breakPredObj) {return lines;}
  
  const out: string[] = [];
  
  for (const raw of lines) {
    formatBrackets(raw, cfg, 0).forEach(l => out.push(l));
  }
  
  return out;
}

function formatBrackets(
  rawLine: string,
  cfg: any,
  depth = 0
): string[] {
  const trimmed = rawLine.trim();
  const leadWS  = (rawLine.match(/^(\s*)/) || ['',''])[1];

  let db = 0, start = -1;
  let inString = false, stringDelim = '', prevChar = '';
  for (let i = 0; i < trimmed.length; i++) {
    if ((trimmed[i] === '"' || trimmed[i] === "'") && prevChar !== '\\') {
      if (!inString) { inString = true; stringDelim = trimmed[i]; }
      else if (trimmed[i] === stringDelim) { inString = false; }
    }
    if(!inString) {
      if (trimmed[i] === '[' && db === 0) { start = i; break; }
      if (trimmed[i] === '[') {db++;}
      if (trimmed[i] === ']') {db--;}
    }
  }
  if (start < 0) {
    return [rawLine];
  }

  const before    = trimmed.slice(0, start).trimEnd(); 
  const rest      = trimmed.slice(start + 1).trim();  
  db = 1;
  let end = -1;
  inString = false; stringDelim = ''; prevChar = '';

  for (let i = 0; i < rest.length; i++) {
    if ((rest[i] === '"' || rest[i] === "'") && prevChar !== '\\') {
      if (!inString) { inString = true; stringDelim = rest[i]; }
      else if (rest[i] === stringDelim) { inString = false; }
    }
    if(!inString) {
      if (rest[i] === '[') {db++;}
      if (rest[i] === ']') {
        db--;
        if (db === 0) { end = i; break; }
      }
    }
    prevChar = rest[i];
  }
  if (end < 0) {
    return [rawLine];
  }

  const innerFull = rest.slice(0, end).trim();   
  const afterFull = rest.slice(end + 1).trim();  
  // eslint-disable-next-line no-useless-escape
  const termMatch = afterFull.match(/^([;\.])/);
  const closeTerm = termMatch ? termMatch[1] : '';
  const trailing  = termMatch ? afterFull.slice(1).trim() : afterFull;

  const lines: string[] = [];

  lines.push(`${leadWS}${before} [`);

  const segments = splitTopLevel(innerFull, ';');
  const innerIndent = leadWS + ' '.repeat(cfg.indentSize * (depth + 1));

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg) {continue;}
    const sep = i < segments.length - 1 ? ';' : '';
    const segLine = `${innerIndent}${seg}${sep}`;
    formatBrackets(segLine, cfg, depth + 1).forEach(l => lines.push(l));
  }

  const closeIndent = leadWS + ' '.repeat(cfg.indentSize * (depth !== 0 ? depth: depth + 1));
  lines.push(`${closeIndent}]${closeTerm}`);

  if (trailing) {
    const trailLine = `${closeIndent}${trailing}`;
    formatBrackets(trailLine, cfg, depth).forEach(l => lines.push(l));
  }

  return lines;
}
