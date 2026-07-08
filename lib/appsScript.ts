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

  // Dynamic import keeps the debug module out of the Edge bundle.
  const { recordTrace } = await import("@/lib/appsScriptDebug");

  // 구글 Apps Script 는 순간 과부하/일시 오류로 404("파일 열 수 없음"), 5xx,
  // HTML 오류 페이지, 또는 abort 를 자주 뱉는다. 이런 "일시적" 실패는 자동으로
  // 몇 번 재시도해 사용자에게 빨간 에러로 튀지 않도록 한다.
  // 쓰기(POST)는 중복 기록을 막기 위해 "스크립트가 실행되지 않은 게 확실한"
  // 경우(HTTP 4xx/5xx·HTML 페이지)만 재시도하고, 자체 타임아웃 abort(서버에서
  // 이미 처리됐을 수 있음)에는 재시도하지 않는다.
  const RETRYABLE_STATUS = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const backoff = (attempt: number) => 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);

  let httpStatus: number | undefined;
  let responseBody: string | undefined;
  let parsed: AppsScriptResponse | undefined;
  let lastError: AppsScriptCallError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
        body: requestBody,
        redirect: "follow",
        signal: ctrl.signal,
        // Next.js 14 데이터 캐시 우회.
        cache: "no-store",
      });
      httpStatus = res.status;
      responseBody = await res.text();

      if (!res.ok) {
        if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(res.status)) {
          clearTimeout(timer);
          await sleep(backoff(attempt));
          continue;
        }
        const errorMessage = `Apps Script HTTP ${res.status}`;
        recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
        clearTimeout(timer);
        throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
      }

      try {
        parsed = JSON.parse(responseBody) as AppsScriptResponse;
      } catch {
        // 구글이 스크립트 대신 HTML 오류 페이지를 돌려준 경우 → 일시적, 재시도.
        const looksHtml = /<html|<!doctype/i.test(responseBody ?? "");
        if (attempt < MAX_ATTEMPTS && looksHtml) {
          clearTimeout(timer);
          await sleep(backoff(attempt));
          continue;
        }
        const errorMessage = "Apps Script returned non-JSON response";
        recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
        clearTimeout(timer);
        throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
      }

      if (parsed.ok === false) {
        // 스크립트가 정상 실행되어 논리 오류를 반환 → 재시도하지 않는다.
        const reason = (parsed as AppsScriptErr).error ?? (parsed as AppsScriptErr).message ?? "Apps Script returned ok:false";
        const errorMessage = `Apps Script: ${reason}`;
        recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
        clearTimeout(timer);
        throw new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, parsed, errorMessage });
      }

      recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: true, at: new Date().toISOString() });
      clearTimeout(timer);
      return parsed as AppsScriptOk;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AppsScriptCallError) throw err;
      // fetch 자체 실패(네트워크/타임아웃 abort). 읽기는 항상 재시도, 쓰기는
      // abort 엔 재시도하지 않아(서버에서 이미 처리됐을 수 있음) 중복을 막는다.
      const isAbort = (err as Error)?.name === "AbortError";
      const errorMessage = isAbort ? "Apps Script 요청 시간 초과(aborted)" : (err as Error).message;
      lastError = new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
      const canRetry = attempt < MAX_ATTEMPTS && (method === "GET" || !isAbort);
      if (canRetry) {
        await sleep(backoff(attempt));
        continue;
      }
      recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
      throw lastError;
    }
  }
  // 재시도(HTTP/HTML) 를 마지막까지 소진한 경우 — 안전망.
  const errorMessage = `Apps Script 일시 오류로 ${MAX_ATTEMPTS}회 재시도 후 실패`;
  recordTrace({ url, action, method, requestBody, httpStatus, responseBody, ok: false, errorMessage, at: new Date().toISOString() });
  throw lastError ?? new AppsScriptCallError({ url, action, method, requestBody, httpStatus, responseBody, errorMessage });
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
