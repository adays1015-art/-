// Google Sheets 백엔드 (Apps Script 웹앱 프록시).
//
// WR_APPS_SCRIPT_URL 이 설정되면 Sheets를, 아니면 로컬 JSON 파일을 쓴다.
// Apps Script 프록시 방식이라 Vercel(서버리스)에서도 HTTPS 호출만으로 동작한다.
// 와이어 포맷은 apps-script.gs 참고.

const URL_ = process.env.WR_APPS_SCRIPT_URL;

export function useSheets(): boolean {
  return !!URL_;
}

type Ok = { ok: true; data?: Record<string, string>[]; rowNumber?: number | null };
type Err = { ok: false; error?: string };

async function call(action: string, body?: unknown): Promise<Ok> {
  if (!URL_) throw new Error("WR_APPS_SCRIPT_URL 미설정");
  const res = await fetch(`${URL_}?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apps Script HTTP ${res.status}: ${text.slice(0, 200)}`);
  let parsed: Ok | Err;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`Apps Script 응답 해석 실패: ${text.slice(0, 200)}`); }
  if ((parsed as Err).ok === false) throw new Error((parsed as Err).error || "Apps Script ok:false");
  return parsed as Ok;
}

export async function getSheet(tab: string): Promise<Record<string, string>[]> {
  const r = await call("getSheet", { sheetName: tab });
  return r.data ?? [];
}

export async function appendRow(tab: string, values: Record<string, unknown>): Promise<void> {
  await call("appendRow", { sheetName: tab, values });
}

export async function updateRow(tab: string, rowNumber: number, values: Record<string, unknown>): Promise<void> {
  await call("updateRow", { sheetName: tab, rowNumber, values });
}

export async function findRowNumber(tab: string, column: string, value: string): Promise<number | null> {
  const r = await call("findRow", { sheetName: tab, columnName: column, value });
  return r.rowNumber ?? null;
}
