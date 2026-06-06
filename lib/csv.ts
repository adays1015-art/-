/**
 * Minimal RFC-4180 CSV serializer/parser.
 *
 * - Writes a UTF-8 BOM so Excel and Google Sheets recognise Korean text correctly.
 * - Quotes any field containing commas, quotes, CR, or LF; escapes inner quotes by doubling.
 * - Parser handles quoted fields, embedded commas/newlines, and CRLF/LF line endings.
 */

const BOM = "﻿";

export function serializeCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeField).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeField).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

function escapeField(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Parse CSV into rows of strings. First row is treated as the header.
 * Returns { headers, rows } where each rows[i] is keyed by header.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const all: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { cur.push(field); field = ""; i++; continue; }
    if (ch === "\r") {
      cur.push(field); field = "";
      if (text[i + 1] === "\n") i += 2; else i++;
      if (cur.length > 0 && !(cur.length === 1 && cur[0] === "")) all.push(cur);
      cur = []; continue;
    }
    if (ch === "\n") {
      cur.push(field); field = ""; i++;
      if (cur.length > 0 && !(cur.length === 1 && cur[0] === "")) all.push(cur);
      cur = []; continue;
    }
    field += ch; i++;
  }
  // Flush last field/row if any
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    if (!(cur.length === 1 && cur[0] === "")) all.push(cur);
  }

  if (all.length === 0) return { headers: [], rows: [] };
  const headers = all[0];
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < all.length; r++) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = all[r][idx] ?? ""; });
    rows.push(obj);
  }
  return { headers, rows };
}
