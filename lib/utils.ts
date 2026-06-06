export function formatNumber(n: number): string {
  if (Number.isNaN(n) || n === undefined || n === null) return "0";
  return n.toLocaleString("ko-KR");
}

export function formatCurrency(n: number): string {
  return `${formatNumber(Math.round(n))}원`;
}

export function formatDate(s: string): string {
  if (!s) return "-";
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

/**
 * Format any date-ish value as "YYYY-MM-DD" in the Asia/Seoul timezone.
 *
 *   "2026-05-31T15:00:00.000Z" → "2026-06-01"   (UTC 15:00 = KST 00:00 next day)
 *   "2026-06-01"               → "2026-06-01"   (no-op, no time present)
 *   ""  / null / unparseable   → "-"
 *
 * Use this for display-only contexts (LOT list, process chips, disposal
 * date). Stored values are not mutated.
 */
const KST_DATE_FMT = typeof Intl !== "undefined"
  ? new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit",
    })
  : null;
export function formatDateKst(s: string | null | undefined): string {
  if (s == null || s === "") return "-";
  const raw = String(s).trim();
  if (!raw) return "-";
  // Pure YYYY-MM-DD — no clock component, return as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // ISO timestamp with T / space, or any value Date() can parse.
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw) || /^\d{4}[/.]\d{2}[/.]\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && KST_DATE_FMT) {
      return KST_DATE_FMT.format(d).replace(/[^\d-]/g, "").slice(0, 10);
    }
  }
  // Compact ISO date 20260601 → 2026-06-01.
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  // Anything else parseable.
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime()) && KST_DATE_FMT) {
    return KST_DATE_FMT.format(d).replace(/[^\d-]/g, "").slice(0, 10);
  }
  return raw.slice(0, 10);
}

export function formatDateTime(s: string): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ko-KR", { hour12: false });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function genId(prefix: string): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `${prefix}-${t.slice(-4)}${r}`;
}

/**
 * Canonical fragrance LOT code: `F-{YYYYMMDD}-{seq3}`. Distinct prefix from
 * 품목생산LOT so fragrance LOTs can be filtered by code-prefix anywhere in
 * the app. Pure — safe for client + server.
 *
 *   F-20260603-001
 *
 * Seq is the count of existing fragrance LOTs (codes starting with "F-")
 * for the same date, +1, zero-padded to 3 digits.
 */
export function generateFragranceLotCode(
  date: string,
  existingLotNos: string[],
): string {
  const raw = String(date ?? "").trim();
  const ymd = raw.replace(/-/g, "").slice(0, 8);
  if (ymd.length !== 8) return "";
  const sameDay = existingLotNos.filter(
    (n) => typeof n === "string" && n.startsWith(`F-${ymd}-`),
  );
  const seq = (sameDay.length + 1).toString().padStart(3, "0");
  return `F-${ymd}-${seq}`;
}

/**
 * Canonical LOT code: `LOT-{itemNo}-{YYYYMMDD}-{seq2}` (e.g. LOT-101-20260530-01).
 * Sequence = count of existing LOTs sharing (itemNo, date) + 1, zero-padded
 * to two digits. Returns "" when itemNo or date can't form a valid code.
 *
 * Pure function — safe for both server and client use.
 */
export function generateLotCode(
  itemNo: string,
  date: string,
  existingLots: Array<{ itemNo: string; date: string }>,
): string {
  const code = String(itemNo ?? "").trim();
  const raw = String(date ?? "").trim();
  if (!code || !raw) return "";
  const ymd = raw.replace(/-/g, "");
  if (ymd.length !== 8) return "";
  const sameDay = existingLots.filter(
    (l) => l.itemNo === code && (l.date || "").replace(/-/g, "") === ymd,
  );
  const seq = (sameDay.length + 1).toString().padStart(2, "0");
  return `LOT-${code}-${ymd}-${seq}`;
}
