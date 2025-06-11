/* eslint-disable @typescript-eslint/no-explicit-any */

export function breakPredObj(
  lines: string[],
  cfg: any
): string[] {
  if(!cfg.breakPredObj) return lines;
  
  const out: string[] = [];
  
  for (const raw of lines) {
    formatBrackets(raw, cfg, 0).forEach(l => out.push(l));
  }
  
  return out;
}

function splitTopLevel(str: string, sep: string): string[] {
  const parts: string[] = [];
  let buf = '', depthP = 0, depthB = 0;
  for (const ch of str) {
    if (ch === '(') depthP++;
    else if (ch === ')') depthP--;
    else if (ch === '[') depthB++;
    else if (ch === ']') depthB--;
    if (ch === sep && depthP === 0 && depthB === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function formatBrackets(
  rawLine: string,
  cfg: any,
  depth = 0
): string[] {
  const trimmed = rawLine.trim();
  const leadWS  = (rawLine.match(/^(\s*)/) || ['',''])[1];

  let db = 0, start = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '[' && db === 0) { start = i; break; }
    if (trimmed[i] === '[') db++;
    if (trimmed[i] === ']') db--;
  }
  if (start < 0) {
    return [rawLine];
  }

  const before    = trimmed.slice(0, start).trimEnd(); 
  const rest      = trimmed.slice(start + 1).trim();  
  db = 1;
  let end = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '[') db++;
    if (rest[i] === ']') {
      db--;
      if (db === 0) { end = i; break; }
    }
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
    if (!seg) continue;
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
