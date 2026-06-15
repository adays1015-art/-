/**
 * Minimal client for the Google Apps Script web-app proxy.
 *
 * Wire format:
 *
 *   GET  {url}?action=ping
 *        → { ok: true, message?: string }
 *
 *   GET  {url}?action=getSheet&sheetName=<tab>
 *        → { ok: true, data: Record<string, unknown>[] }
 *           (also accepted: { ok: true, values: [[header,...], [row,...], ...] }
 *                          or { ok: true, rows: [{...}, ...] })
 *
 *   POST {url}?action=findRow
 *        body: { sheetName, columnName, value }    (value compared as string)
 *        → { ok: true, rowNumber: number | null }
 *
 *   POST {url}?action=appendRow
 *        body: { sheetName, values: { col: val, ... } }
 *        → { ok: true, rowNumber?: number }
 *
 *   POST {url}?action=updateRow
 *        body: { sheetName, rowNumber, values: { col: val, ... } }
 *        → { ok: true }
 *
 * On any failure (HTTP error, JSON parse error, or { ok: false }), throws an
 * AppsScriptCallError carrying the full request/response context so the UI
 * can show it.
 */

export interface AppsScriptOk {
  ok: true;
  data?: Record<string, unknown>[];
  values?: unknown[][];
  rows?: Record<string, unknown>[];
  message?: string;
  rowNumber?: number | null;
  docId?: string;
  docUrl?: string;
}
export interface AppsScriptErr {
  ok: false;
  error?: string;
  message?: string;
}
export type AppsScriptResponse = AppsScriptOk | AppsScriptErr;

export interface AppsScriptCallDetail {
  url: string;
  action: string;
  method: "GET" | "POST";
  requestBody?: string;
  httpStatus?: number;
  responseBody?: string;
  parsed?: AppsScriptResponse;
  errorMessage: string;
}

export class AppsScriptCallError extends Error {
  detail: AppsScriptCallDetail;
  constructor(detail: AppsScriptCallDetail) {
    super(detail.errorMessage);
    this.name = "AppsScriptCallError";
    this.detail = detail;
  }
}

function ensureUrl(raw: string | undefined): string {
  const u = (raw ?? "").trim();
  if (!u) throw new Error("Apps Script URL이 설정되지 않았습니다.");
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(u)) {
    throw new Error("Apps Script URL 형식이 올바르지 않습니다 (https://script.google.com/...).");
  }
  return u;
}

async function call(opts: {
  url: string;
  action: string;
  method: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}): Promise<AppsScriptOk> {
  const { url, action, method, body, timeoutMs = 30_000 } = opts;
  const requestBody = body !== undefined ? JSON.stringify(body) : undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let httpStatus: number | undefined;
  let responseBody: string | undefined;
  let parsed: AppsScriptResponse | undefined;
  // Dynamic import keeps the debug module out of the Edge bundle.
  const { recordTrace } = await import("@/lib/appsScriptDebug");

  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
      body: requestBody,
      redirect: "follow",
      signal: ctrl.signal,
      // Next.js 14 데이터 캐시 우회. force-dynamic 페이지 안에서도
      // fetch 가 cached 될 가능성을 차단합니다.
      cache: "no-store",
    });
    httpStatus = res.status;
    responseBody = await res.text();
    if (!res.ok) {
      const errorMessage = `Apps Script HTTP ${res.status}`;
      recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
      throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
    }
    try {
      parsed = JSON.parse(responseBody) as AppsScriptResponse;
    } catch {
      const errorMessage = "Apps Script returned non-JSON response";
      recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
      throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
    }
    if (parsed.ok === false) {
      const reason = (parsed as AppsScriptErr).error ?? (parsed as AppsScriptErr).message ?? "Apps Script returned ok:false";
      const errorMessage = `Apps Script: ${reason}`;
      recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
      throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, parsed, errorMessage });
    }
    recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: true, at: new Date().toISOString() });
    return parsed as AppsScriptOk;
  } catch (err) {
    if (err instanceof AppsScriptCallError) throw err;
    const errorMessage = (err as Error).message;
    recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
    throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
  } finally {
    clearTimeout(timer);
  }
}

export async function pingAppsScript(url: string): Promise<{ ok: boolean; message?: string; detail?: AppsScriptCallDetail }> {
  let u: string;
  try { u = ensureUrl(url); } catch (e) { return { ok: false, message: (e as Error).message }; }
  try {
    const r = await call({ url: `${u}?action=ping`, action: "ping", method: "GET" });
    return { ok: true, message: r.message };
  } catch (e) {
    const detail = (e as AppsScriptCallError).detail;
    return { ok: false, message: detail?.errorMessage ?? (e as Error).message, detail };
  }
}

export async function appsScriptGetSheet(url: string, sheetName: string): Promise<Record<string, string>[]> {
  const u = ensureUrl(url);
  const target = `${u}?action=getSheet&sheetName=${encodeURIComponent(sheetName)}`;
  const r = await call({ url: target, action: "getSheet", method: "GET" });

  if (Array.isArray(r.data) && (r.data.length === 0 || typeof r.data[0] === "object")) {
    return r.data.map((row) => objToStrings(row as Record<string, unknown>));
  }
  if (Array.isArray(r.rows)) {
    return r.rows.map((row) => objToStrings(row));
  }
  if (Array.isArray(r.values) && r.values.length > 0) {
    const [header, ...rows] = r.values;
    return rows.map((row) => {
      const o: Record<string, string> = {};
      (header as unknown[]).forEach((k, i) => {
        const v = (row as unknown[])[i];
        o[String(k)] = v == null ? "" : String(v);
      });
      return o;
    });
  }
  return [];
}

function objToStrings(r: Record<string, unknown>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of Object.keys(r)) {
    const v = r[k];
    o[k] = v == null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  }
  return o;
}

/**
 * Find a row by column value. Returns 1-indexed sheet row number, or null.
 * `value` is compared as a string on the Apps Script side.
 */
export async function appsScriptFindRow(url: string, sheetName: string, columnName: string, value: string): Promise<number | null> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=findRow`,
    action: "findRow",
    method: "POST",
    body: { sheetName, columnName, value: String(value) },
  });
  return typeof r.rowNumber === "number" ? r.rowNumber : null;
}

/**
 * Append a row. `values` is an object keyed by column name.
 */
export async function appsScriptAppendRow(url: string, sheetName: string, values: Record<string, unknown>): Promise<void> {
  const u = ensureUrl(url);
  await call({
    url: `${u}?action=appendRow`,
    action: "appendRow",
    method: "POST",
    body: { sheetName, values },
  });
}

/**
 * Update a row by 1-indexed sheet row number. `values` is an object keyed by column name.
 */
export async function appsScriptUpdateRow(url: string, sheetName: string, rowNumber: number, values: Record<string, unknown>): Promise<void> {
  const u = ensureUrl(url);
  await call({
    url: `${u}?action=updateRow`,
    action: "updateRow",
    method: "POST",
    body: { sheetName, rowNumber, values },
  });
}

/**
 * Append multiple rows in a single Apps Script round-trip. Each entry is an
 * object keyed by column name; missing columns are auto-added (single header
 * expansion across the batch).
 */
export async function appsScriptBatchAppendRows(
  url: string,
  sheetName: string,
  rows: Record<string, unknown>[],
): Promise<number[]> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=batchAppendRows`,
    action: "batchAppendRows",
    method: "POST",
    body: { sheetName, rows },
    timeoutMs: 60_000,
  });
  const rn = (r as unknown as { rowNumbers?: number[] }).rowNumbers;
  return Array.isArray(rn) ? rn : [];
}

/**
 * Strict single-row append. Validates the sheet has every expectedHeader;
 * writes by column-name mapping; unknown keys are dropped silently.
 */
export async function appsScriptStrictAppendRow(
  url: string,
  sheetName: string,
  expectedHeaders: string[],
  values: Record<string, unknown>,
): Promise<number | null> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=strictAppendRow`,
    action: "strictAppendRow",
    method: "POST",
    body: { sheetName, expectedHeaders, values },
  });
  return typeof r.rowNumber === "number" ? r.rowNumber : null;
}

/**
 * Strict single-row update.
 */
export async function appsScriptStrictUpdateRow(
  url: string,
  sheetName: string,
  expectedHeaders: string[],
  rowNumber: number,
  values: Record<string, unknown>,
): Promise<void> {
  const u = ensureUrl(url);
  await call({
    url: `${u}?action=strictUpdateRow`,
    action: "strictUpdateRow",
    method: "POST",
    body: { sheetName, expectedHeaders, rowNumber, values },
  });
}

/**
 * Strict batch append. Requires the sheet to already contain all
 * `expectedHeaders` by name (no auto-create). Writes by column-name mapping.
 * Throws an AppsScriptCallError with the schema-mismatch detail if any
 * expected header is missing — that error then surfaces to the UI verbatim.
 */
export async function appsScriptStrictBatchAppendRows(
  url: string,
  sheetName: string,
  expectedHeaders: string[],
  rows: Record<string, unknown>[],
): Promise<number[]> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=strictBatchAppendRows`,
    action: "strictBatchAppendRows",
    method: "POST",
    body: { sheetName, expectedHeaders, rows },
    timeoutMs: 60_000,
  });
  const rn = (r as unknown as { rowNumbers?: number[] }).rowNumbers;
  return Array.isArray(rn) ? rn : [];
}

/**
 * Update multiple rows in a single Apps Script round-trip. Each entry has a
 * 1-indexed `rowNumber` and a `values` object keyed by column name.
 */
export async function appsScriptBatchUpdateRows(
  url: string,
  sheetName: string,
  updates: Array<{ rowNumber: number; values: Record<string, unknown> }>,
): Promise<void> {
  const u = ensureUrl(url);
  await call({
    url: `${u}?action=batchUpdateRows`,
    action: "batchUpdateRows",
    method: "POST",
    body: { sheetName, updates },
    timeoutMs: 60_000,
  });
}

export interface InitSheetResult {
  sheetName: string;
  status: "created" | "header-added" | "skipped" | "error";
  message: string;
}

/**
 * Initialize sheets idempotently: create missing tabs, write missing headers,
 * never touch existing data. Returns per-sheet status.
 */
export async function appsScriptInitializeSheets(
  url: string,
  specs: Array<{ sheetName: string; headers: string[] }>,
): Promise<InitSheetResult[]> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=initializeSheets`,
    action: "initializeSheets",
    method: "POST",
    body: { specs },
    timeoutMs: 60_000,
  });
  // The handler returns { ok: true, results: [...] } — captured into AppsScriptOk via parsed body.
  // We pass back the results array as-is.
  const results = (r as unknown as { results?: InitSheetResult[] }).results;
  return Array.isArray(results) ? results : [];
}

/**
 * 주간작업보고서를 Google Docs 문서로 생성하거나 갱신합니다.
 * Apps Script가 사용자 계정으로 실행되므로 DocumentApp/DriveApp 권한으로
 * Drive에 문서를 만들고 그 URL을 돌려줍니다.
 *
 * - docId 가 주어지고 해당 문서가 존재하면: 본문을 비우고 다시 씀(갱신).
 * - 없으면: 새 문서를 생성(folderName 지정 시 해당 폴더로 이동).
 *
 * 반환: { docId, docUrl }
 */
export async function appsScriptCreateWeeklyReportDoc(
  url: string,
  payload: {
    docId?: string;
    folderName?: string;
    title: string;
    fields: Array<{ label: string; value: string }>;
    footer?: string;
  },
): Promise<{ docId: string; docUrl: string }> {
  const u = ensureUrl(url);
  const r = await call({
    url: `${u}?action=createWeeklyReportDoc`,
    action: "createWeeklyReportDoc",
    method: "POST",
    body: payload,
    timeoutMs: 60_000,
  });
  return {
    docId: String(r.docId ?? ""),
    docUrl: String(r.docUrl ?? ""),
  };
}
