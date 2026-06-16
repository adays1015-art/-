/**
 * Google Sheets connector — four operating modes (priority order):
 *
 *   1. "apps-script"     — fetch through a deployed Apps Script web-app proxy
 *                          (URL stored in runtime config or APPS_SCRIPT_URL env).
 *                          PRIMARY mode when service-account keys are unavailable.
 *                          No OAuth client needed in this app. The Apps Script
 *                          authenticates against the spreadsheet on the server.
 *
 *   2. "service-account" — uses a service-account JWT. Highest reliability when
 *                          available. Activated by GOOGLE_SERVICE_ACCOUNT_EMAIL +
 *                          GOOGLE_PRIVATE_KEY + a Sheet ID.
 *
 *   3. "oauth"           — uses the logged-in user's OAuth access token.
 *                          Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET +
 *                          a Sheet ID + a session with `accessToken`.
 *
 *   4. "mock"            — in-memory store. Always works.
 *
 * Expected sheet-tab names: see SHEET_TABS below.
 */

import { google, type sheets_v4 } from "googleapis";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveAppsScriptUrl, getEffectiveSheetId } from "@/lib/runtimeConfig";
import {
  AppsScriptCallError,
  appsScriptAppendRow,
  appsScriptBatchAppendRows,
  appsScriptBatchUpdateRows,
  appsScriptFindRow,
  appsScriptGetSheet,
  appsScriptStrictAppendRow,
  appsScriptStrictBatchAppendRows,
  appsScriptStrictUpdateRow,
  appsScriptUpdateRow,
} from "@/lib/appsScript";

export const SHEET_TABS = {
  materials: "원료재고",
  items: "품목마스터",
  bom: "품목BOM",
  itemLots: "품목생산LOT",
  setOptions: "세트옵션",
  setComposition: "세트구성품목",
  setBom: "세트BOM",
  setAssemblyLots: "세트조립LOT",
  finishedSets: "완제품세트재고",
  shipments: "출고이력",
  history: "작업이력",
  cost: "원가설정",
  costCalc: "원가계산",
  bomTemplate: "BOM템플릿",
  productionExecution: "품목생산투입원료",
  materialTransactions: "원료입출고",
  fragrances: "향마스터",
  fragranceBom: "향BOM",
  fragranceLots: "향생산LOT",
  fragranceExecution: "향생산투입원료",
  equipment: "설비마스터",
  clients: "거래처마스터",
  // ─── 업사이클링 라인 (버려지는 화장품 재활용) — 독립 관리 ───
  upcycleMaterials: "업사이클원료재고",
  upcycleItems: "업사이클품목마스터",
  upcycleBom: "업사이클BOM",
  upcycleLots: "업사이클생산LOT",
  upcycleExecution: "업사이클생산투입원료",
  // ─── 테스트 결과 (이미지 비교) ───
  testResults: "테스트결과",
} as const;

export type SheetTabKey = keyof typeof SHEET_TABS;
export type SheetsMode = "mock" | "apps-script" | "oauth" | "service-account";

// ─── Mode detection ────────────────────────────────────────
// Async: returns the mode for *this* request.
export async function getSheetsMode(): Promise<SheetsMode> {
  const appsUrl = await getEffectiveAppsScriptUrl();
  if (appsUrl) return "apps-script";
  const id = await getEffectiveSheetId();
  if (!id) return "mock";
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return "service-account";
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "oauth";
  return "mock";
}

// Sync, env-only — for rare places where async is awkward.
export function getSheetsModeFromEnv(): SheetsMode {
  if (process.env.APPS_SCRIPT_URL) return "apps-script";
  if (!process.env.GOOGLE_SHEET_ID) return "mock";
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return "service-account";
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "oauth";
  return "mock";
}

export async function getSheetId(): Promise<string> {
  const id = await getEffectiveSheetId();
  if (!id) throw new Error("Sheet ID is not set.");
  return id;
}

// ─── Client resolution (only for oauth/service-account) ───
function buildServiceAccountClient(): sheets_v4.Sheets {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function buildOAuthClient(accessToken: string): sheets_v4.Sheets {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth: oauth2 });
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets | null> {
  const mode = await getSheetsMode();
  if (mode === "mock" || mode === "apps-script") return null;
  if (mode === "service-account") return buildServiceAccountClient();
  // oauth
  const session = await getServerSession(authOptions);
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  if (!accessToken) return null;
  return buildOAuthClient(accessToken);
}

/**
 * "Should services try to use Sheets for this request?" — true for any non-mock
 * mode that is actually usable (oauth needs a session token; apps-script and
 * service-account need only their config).
 */
export async function useSheets(): Promise<boolean> {
  const mode = await getSheetsMode();
  if (mode === "apps-script") return true;
  if (mode === "service-account") return true;
  if (mode === "oauth") {
    const session = await getServerSession(authOptions);
    return !!(session as { accessToken?: string } | null)?.accessToken;
  }
  return false;
}

// ─── Tab helpers (mode-aware) ───────────────────────────────
// Each service calls these inside `if (await useSheets()) { … }`.

/**
 * Like `readRows`, but returns `[]` instead of throwing when the underlying
 * tab does not exist yet. Use this for *new* tabs that may not have been
 * created in the user's spreadsheet — so the first page render doesn't 500
 * for users who haven't initialized those tabs.
 *
 * All other errors still propagate (so genuine outages aren't masked).
 */
export async function readRowsOrEmpty<T = Record<string, string>>(tab: string): Promise<T[]> {
  try {
    return await readRows<T>(tab);
  } catch (err) {
    if (err instanceof AppsScriptCallError) {
      const msg = err.detail?.errorMessage ?? "";
      if (/Sheet not found/i.test(msg)) return [];
    }
    // For service-account / oauth modes, the Sheets API returns a 400 with
    // "Unable to parse range" when the tab doesn't exist. Treat the same.
    const m = (err as Error)?.message ?? "";
    if (/Unable to parse range|Requested entity was not found/i.test(m)) return [];
    throw err;
  }
}

export async function readRows<T = Record<string, string>>(tab: string): Promise<T[]> {
  const mode = await getSheetsMode();

  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const rows = await appsScriptGetSheet(url, tab);
    return rows as T[];
  }

  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1:Z`,
  });
  const values = res.data.values ?? [];
  if (values.length === 0) return [];
  const [header, ...rows] = values;
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => { obj[String(key)] = row[idx] ?? ""; });
    return obj as T;
  });
}

/**
 * Append a row. Pass headers so apps-script mode can build a `values: {col: val}`
 * object keyed by column name (the contract Apps Script's appendRow expects).
 * For oauth/service-account modes the headers param is ignored.
 */
export async function appendRow(
  tab: string,
  values: (string | number | boolean)[],
  headers?: string[],
): Promise<void> {
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const valuesObj = zip(headers, values);
    await appsScriptAppendRow(url, tab, valuesObj);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  await sheets.spreadsheets.values.append({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

export async function updateRow(
  tab: string,
  rowNumber: number,
  values: (string | number | boolean)[],
  headers?: string[],
): Promise<void> {
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const valuesObj = zip(headers, values);
    await appsScriptUpdateRow(url, tab, rowNumber, valuesObj);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  await sheets.spreadsheets.values.update({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

function zip(headers: string[] | undefined, values: (string | number | boolean)[]): Record<string, unknown> {
  if (!headers) {
    throw new Error("Apps Script mode requires column headers; service must pass them to appendRow/updateRow.");
  }
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) obj[headers[i]] = values[i];
  return obj;
}

export async function findRowNumberByColumn(tab: string, columnName: string, value: string): Promise<number | null> {
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    return await appsScriptFindRow(url, tab, columnName, value);
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1:Z`,
  });
  const values = res.data.values ?? [];
  if (values.length === 0) return null;
  const header = values[0];
  const colIdx = header.findIndex((h) => h === columnName);
  if (colIdx === -1) return null;
  for (let i = 1; i < values.length; i++) {
    if ((values[i][colIdx] ?? "") === value) return i + 1;
  }
  return null;
}

/**
 * Append N rows in a single round-trip. `rows` must be aligned with `headers`
 * (same length, same order). For Apps Script mode this becomes one POST; for
 * service-account / oauth modes it's one Sheets values.append call.
 */
export async function batchAppendRows(
  tab: string,
  rows: (string | number | boolean)[][],
  headers: string[],
): Promise<void> {
  if (rows.length === 0) return;
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const objs = rows.map((row) => zip(headers, row));
    await appsScriptBatchAppendRows(url, tab, objs);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  await sheets.spreadsheets.values.append({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

/**
 * Strict single-row append. Validates the sheet's header row contains all
 * names in `expectedHeaders`. Writes by column-name mapping; unknown keys
 * are dropped silently. Throws "Schema mismatch on '<tab>' — missing
 * columns: …" on validation failure.
 */
export async function strictAppendRow(
  tab: string,
  values: (string | number | boolean)[],
  expectedHeaders: string[],
): Promise<void> {
  const mode = await getSheetsMode();
  const valuesObj = zip(expectedHeaders, values);
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    await appsScriptStrictAppendRow(url, tab, expectedHeaders, valuesObj);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!1:1`,
  });
  const existing = (res.data.values?.[0] ?? []).map((v) => String(v));
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: await getSheetId(),
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [expectedHeaders] },
    });
    existing.push(...expectedHeaders);
  }
  const missing = expectedHeaders.filter((h) => !existing.includes(h));
  if (missing.length > 0) {
    throw new Error(`Schema mismatch on '${tab}' — missing columns: ${missing.join(", ")}`);
  }
  const row = new Array(existing.length).fill("");
  for (const [k, v] of Object.entries(valuesObj)) {
    const i = existing.indexOf(k);
    if (i >= 0) row[i] = v as string | number | boolean;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

/**
 * Strict single-row update. Same validation as strictAppendRow.
 */
export async function strictUpdateRow(
  tab: string,
  rowNumber: number,
  values: (string | number | boolean)[],
  expectedHeaders: string[],
): Promise<void> {
  const mode = await getSheetsMode();
  const valuesObj = zip(expectedHeaders, values);
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    await appsScriptStrictUpdateRow(url, tab, expectedHeaders, rowNumber, valuesObj);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!1:1`,
  });
  const existing = (headerRes.data.values?.[0] ?? []).map((v) => String(v));
  const missing = expectedHeaders.filter((h) => !existing.includes(h));
  if (missing.length > 0) {
    throw new Error(`Schema mismatch on '${tab}' — missing columns: ${missing.join(", ")}`);
  }
  // Read the existing row so we only overwrite the cells whose key is in valuesObj.
  const rowRes = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!${rowNumber}:${rowNumber}`,
  });
  const current = (rowRes.data.values?.[0] ?? []).map((v) =>
    v == null ? "" : (v as string | number | boolean));
  while (current.length < existing.length) current.push("");
  for (const [k, v] of Object.entries(valuesObj)) {
    const i = existing.indexOf(k);
    if (i >= 0) current[i] = v as string | number | boolean;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [current] },
  });
}

/**
 * Strict batch append. The sheet MUST already contain every name in
 * `expectedHeaders` (no auto-create, no reorder, no schema drift). Per-row
 * data is written by column-name mapping; unknown keys are silently dropped.
 * On schema mismatch the underlying transport throws — the route handler's
 * existing error envelope surfaces the message to the UI.
 */
export async function strictBatchAppendRows(
  tab: string,
  rows: (string | number | boolean)[][],
  expectedHeaders: string[],
): Promise<void> {
  if (rows.length === 0) return;
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const objs = rows.map((row) => zip(expectedHeaders, row));
    await appsScriptStrictBatchAppendRows(url, tab, expectedHeaders, objs);
    return;
  }
  // service-account / oauth: read row 1, validate every expected header is
  // present, then append by column-name mapping.
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!1:1`,
  });
  const existingHeaders = (res.data.values?.[0] ?? []).map((v) => String(v));
  if (existingHeaders.length === 0) {
    // Seed canonical headers (this branch only fires on a brand-new empty tab).
    await sheets.spreadsheets.values.update({
      spreadsheetId: await getSheetId(),
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [expectedHeaders] },
    });
    existingHeaders.push(...expectedHeaders);
  }
  const missing = expectedHeaders.filter((h) => !existingHeaders.includes(h));
  if (missing.length > 0) {
    throw new Error(`Schema mismatch on '${tab}' — missing columns: ${missing.join(", ")}`);
  }
  // Build a per-row matrix the width of the EXISTING header row, by name.
  const ncols = existingHeaders.length;
  const matrix = rows.map((row) => {
    const out = new Array(ncols).fill("");
    expectedHeaders.forEach((h, i) => {
      const colIdx = existingHeaders.indexOf(h);
      if (colIdx >= 0) out[colIdx] = row[i] as string | number | boolean;
    });
    return out;
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: matrix },
  });
}

/**
 * Update N rows in a single round-trip. Each entry pairs a 1-indexed sheet
 * `rowNumber` with the cell values for that row (aligned with `headers`).
 */
export async function batchUpdateRows(
  tab: string,
  updates: Array<{ rowNumber: number; values: (string | number | boolean)[] }>,
  headers: string[],
): Promise<void> {
  if (updates.length === 0) return;
  const mode = await getSheetsMode();
  if (mode === "apps-script") {
    const url = (await getEffectiveAppsScriptUrl())!;
    const payload = updates.map((u) => ({
      rowNumber: u.rowNumber,
      values: zip(headers, u.values),
    }));
    await appsScriptBatchUpdateRows(url, tab, payload);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  // Name-safe partial update: read the header row and the affected row block
  // once, then overwrite ONLY the columns named in `headers`, preserving every
  // other cell. Mirrors strictUpdateRow's safety but batched. (Previously this
  // dumped `values` from column A, which silently clobbered earlier columns
  // when callers passed a partial row — never safe for stock-only writes.)
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!1:1`,
  });
  const existing = (headerRes.data.values?.[0] ?? []).map((v) => String(v));
  const rowNums = updates.map((u) => u.rowNumber);
  const minRow = Math.min(...rowNums);
  const maxRow = Math.max(...rowNums);
  const blockRes = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!A${minRow}:Z${maxRow}`,
  });
  const block = blockRes.data.values ?? [];
  const data = updates.map((u) => {
    const valuesObj = zip(headers, u.values);
    const current = (block[u.rowNumber - minRow] ?? []).map((v) =>
      v == null ? "" : (v as string | number | boolean));
    while (current.length < existing.length) current.push("");
    for (const [k, v] of Object.entries(valuesObj)) {
      const i = existing.indexOf(k);
      if (i >= 0) current[i] = v as string | number | boolean;
    }
    return { range: `${tab}!A${u.rowNumber}`, values: [current] };
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: await getSheetId(),
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

export async function ensureHeader(tab: string, header: string[]): Promise<void> {
  const mode = await getSheetsMode();
  if (mode === "apps-script") return; // managed on the Apps Script side
  const sheets = await getSheetsClient();
  if (!sheets) throw new Error("Sheets unavailable (mode=" + mode + ")");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: await getSheetId(),
    range: `${tab}!1:1`,
  });
  const existing = res.data.values?.[0] ?? [];
  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: await getSheetId(),
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [header] },
    });
  }
}
