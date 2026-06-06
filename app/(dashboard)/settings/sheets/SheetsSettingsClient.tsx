"use client";

import { useState } from "react";
import {
  Save, CheckCircle2, AlertTriangle, ExternalLink, Loader2,
  Plug, FileSpreadsheet, Info, RefreshCw, Trash2, FlaskConical, Zap, Bug,
  Wand2, Circle,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";

type Trace = {
  url: string;
  action: string;
  method: string;
  requestBody?: string;
  httpStatus?: number;
  responseBody?: string;
  ok: boolean;
  errorMessage?: string;
  at: string;
} | null;

type Initial = {
  sheetId: string;
  sheetIdFromEnv: boolean;
  sheetIdEffective: string;
  appsScriptUrlStored: string;
  appsScriptUrlEffective: string;
  appsScriptUrlFromEnv: boolean;
  useMockOverride: boolean;
  mode: "mock" | "apps-script" | "oauth" | "service-account";
  updatedAt: string | null;
  updatedBy: string | null;
  tabs: Record<string, string>;
  lastTrace: Trace;
};

type TestResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  pingMessage?: string;
  sampleRowCount?: number;
};

type InitRow = { sheetName: string; status: "created"|"header-added"|"skipped"|"error"; message: string };
type InitResult = { ok: boolean; error?: string; results?: InitRow[]; counts?: { created: number; header_added: number; skipped: number; error: number } };

const MODE_LABEL: Record<Initial["mode"], string> = {
  "mock": "샘플 데이터 모드",
  "apps-script": "Google Sheets 실데이터 모드",
  "oauth": "OAuth 사용자 인증 모드",
  "service-account": "서비스 계정 모드",
};

export default function SheetsSettingsClient({ initial }: { initial: Initial }) {
  const [appsScriptUrl, setAppsScriptUrl] = useState(initial.appsScriptUrlStored);
  const [sheetId, setSheetId] = useState(initial.sheetId);
  const [data, setData] = useState<Initial>(initial);
  const [busy, setBusy] = useState<null | "save-url" | "save-sheet" | "test" | "clear-url" | "toggle-mock" | "init">(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);
  const [initResult, setInitResult] = useState<InitResult | null>(null);

  async function initializeSheets() {
    if (!confirm("필요한 14개 시트 탭과 헤더를 자동으로 생성합니다. 기존 데이터는 보존됩니다. 계속하시겠습니까?")) return;
    setBusy("init");
    setInitResult(null);
    try {
      const r = await fetch("/api/settings/init-sheets", { method: "POST" });
      const j: InitResult = await r.json();
      setInitResult(j);
    } catch (e) {
      setInitResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    const r = await fetch("/api/settings/sheets");
    if (!r.ok) return;
    const j = await r.json();
    setData((prev) => ({ ...prev, ...j }));
  }

  async function postSettings(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const r = await fetch("/api/settings/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) return { ok: false, error: j.error ?? `HTTP ${r.status}` };
    return { ok: true };
  }

  async function saveUrl() {
    setBusy("save-url");
    setFlash(null);
    const res = await postSettings({ appsScriptUrl });
    setFlash(res.ok ? { ok: true, message: "Apps Script URL 저장 완료. 즉시 모든 요청에 적용됩니다." } : { ok: false, message: res.error ?? "저장 실패" });
    await refresh();
    setBusy(null);
  }

  async function clearUrl() {
    if (!confirm("저장된 Apps Script URL을 삭제하시겠습니까? 샘플 데이터 모드로 전환됩니다.")) return;
    setBusy("clear-url");
    setFlash(null);
    const res = await postSettings({ clearAppsScriptUrl: true, useMockOverride: false });
    if (res.ok) setAppsScriptUrl("");
    setFlash(res.ok ? { ok: true, message: "URL 삭제됨. 샘플 데이터 모드로 전환되었습니다." } : { ok: false, message: res.error ?? "실패" });
    await refresh();
    setBusy(null);
  }

  async function toggleMock() {
    setBusy("toggle-mock");
    setFlash(null);
    const next = !data.useMockOverride;
    const res = await postSettings({ useMockOverride: next });
    setFlash(res.ok
      ? { ok: true, message: next ? "샘플 모드로 임시 전환되었습니다. URL은 저장되어 있습니다." : "Apps Script 모드로 복귀합니다." }
      : { ok: false, message: res.error ?? "실패" });
    await refresh();
    setBusy(null);
  }

  async function saveSheetId() {
    setBusy("save-sheet");
    setFlash(null);
    const res = await postSettings({ sheetId });
    setFlash(res.ok ? { ok: true, message: "Sheet ID 저장 완료." } : { ok: false, message: res.error ?? "저장 실패" });
    await refresh();
    setBusy(null);
  }

  async function testConnection() {
    setBusy("test");
    setTestResult(null);
    const r = await fetch("/api/settings/sheets", { method: "PUT" });
    const j = await r.json();
    setTestResult(j);
    await refresh();
    setBusy(null);
  }

  const isMock = data.mode === "mock";
  const inEnvUrl = data.appsScriptUrlFromEnv;
  const inEnvSheet = data.sheetIdFromEnv;

  return (
    <div>
      <PageHeader
        title="Google Sheets 연결"
        description="Apps Script URL을 저장·교체·해제하고 연결 상태를 진단합니다."
      />

      {/* Mode summary */}
      <div className={`panel panel-pad mb-4 border ${
        isMock ? "border-amber-300 bg-amber-50/40" : "border-emerald-300 bg-emerald-50/40"
      }`}>
        <div className="flex items-start gap-3">
          {isMock
            ? <FlaskConical size={18} className="text-amber-600 mt-0.5 shrink-0" />
            : <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-900">{MODE_LABEL[data.mode]}</div>
            <p className="text-sm text-ink-700 mt-1 leading-relaxed">
              {data.useMockOverride
                ? "샘플 모드 토글이 활성화되어 있어 URL이 저장되어 있어도 메모리 데이터로 동작합니다."
                : isMock
                  ? "Apps Script URL이 설정되지 않아 메모리 샘플 데이터로 동작합니다."
                  : "Apps Script 프록시를 통해 실제 Google Sheets와 양방향 연결되어 있습니다."}
            </p>
            <div className="text-[11px] text-ink-500 mt-2 font-mono break-all">
              현재 적용 URL: {data.appsScriptUrlEffective || "(없음)"}
            </div>
          </div>
          <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw size={12} /> 새로고침</button>
        </div>
      </div>

      {flash && (
        <div className={`panel panel-pad mb-4 border ${flash.ok ? "border-emerald-300 bg-emerald-50/40" : "border-red-300 bg-red-50"}`}>
          <div className="flex items-start gap-2 text-sm">
            {flash.ok ? <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />}
            <span className={flash.ok ? "text-emerald-900" : "text-red-900"}>{flash.message}</span>
          </div>
        </div>
      )}

      {/* Apps Script URL — primary */}
      <div className="panel panel-pad mb-4">
        <h2 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Zap size={14} className="text-emerald-600" /> Apps Script URL
        </h2>
        <div className="space-y-2">
          <label className="label">APPS_SCRIPT_URL</label>
          <input
            className="input font-mono text-xs"
            placeholder="https://script.google.com/macros/s/.../exec"
            value={appsScriptUrl}
            onChange={(e) => setAppsScriptUrl(e.target.value)}
            disabled={inEnvUrl}
          />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button className="btn-primary" onClick={saveUrl} disabled={busy !== null || inEnvUrl}>
              {busy === "save-url" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              저장
            </button>
            <button className="btn-beige" onClick={testConnection} disabled={busy !== null || isMock}>
              {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
              연결 테스트
            </button>
            <button className="btn-ghost" onClick={clearUrl} disabled={busy !== null || inEnvUrl || !data.appsScriptUrlStored}>
              {busy === "clear-url" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              URL 초기화
            </button>
            <button className="btn-ghost" onClick={toggleMock} disabled={busy !== null}>
              {busy === "toggle-mock" ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              {data.useMockOverride ? "실데이터 모드로 복귀" : "샘플 모드로 전환"}
            </button>
          </div>
          <p className="text-[11px] text-ink-500 mt-2 leading-relaxed">
            {inEnvUrl
              ? <>환경 변수(<code className="font-mono">APPS_SCRIPT_URL</code>)가 설정되어 있어 우선 적용됩니다. UI에서는 변경할 수 없습니다.</>
              : <>저장 즉시 모든 읽기/쓰기 요청에 반영됩니다 (재배포 불필요). URL은 <code className="font-mono">.bfter-config.json</code> 에 보관됩니다.</>}
            {data.updatedAt && (
              <> · 마지막 저장 {data.updatedAt.slice(0, 19).replace("T", " ")}{data.updatedBy ? ` (${data.updatedBy})` : ""}</>
            )}
          </p>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`panel panel-pad mb-4 border ${
          testResult.ok ? "border-emerald-300 bg-emerald-50/40"
          : testResult.reason === "mock_mode" ? "border-beige-300 bg-beige-50/60"
          : "border-amber-300 bg-amber-50/60"
        }`}>
          <h3 className="text-sm font-semibold text-ink-900 mb-2 flex items-center gap-2">
            {testResult.ok
              ? <CheckCircle2 size={14} className="text-emerald-600" />
              : <AlertTriangle size={14} className="text-amber-600" />}
            연결 테스트 결과
          </h3>
          {testResult.message && <div className="text-sm text-ink-700 mt-1 leading-relaxed">{testResult.message}</div>}
          {testResult.pingMessage && <div className="text-xs text-ink-500 mt-1">ping: {testResult.pingMessage}</div>}
          {typeof testResult.sampleRowCount === "number" && (
            <div className="text-xs text-ink-500 mt-1">품목마스터: {testResult.sampleRowCount}행</div>
          )}
        </div>
      )}

      {/* Debug panel */}
      <div className="panel panel-pad mb-4 border border-border bg-bg-subtle/30">
        <h2 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <Bug size={14} className="text-ink-600" /> 디버그
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <DebugRow label="활성 모드" value={MODE_LABEL[data.mode]} />
            <DebugRow label="활성 Apps Script URL" value={data.appsScriptUrlEffective || "(없음)"} mono />
            <DebugRow label="저장된 URL" value={data.appsScriptUrlStored || "(없음)"} mono />
            <DebugRow label="환경 변수 우선" value={inEnvUrl ? "예 (APPS_SCRIPT_URL)" : "아니오"} />
            <DebugRow label="샘플 모드 오버라이드" value={data.useMockOverride ? "ON" : "OFF"} />
          </div>
          <div className="space-y-1">
            <DebugRow label="마지막 요청 URL" value={data.lastTrace?.url ?? "(아직 호출 없음)"} mono />
            <DebugRow label="마지막 action" value={data.lastTrace?.action ?? "-"} />
            <DebugRow label="마지막 method" value={data.lastTrace?.method ?? "-"} />
            <DebugRow label="마지막 HTTP" value={data.lastTrace?.httpStatus ? String(data.lastTrace.httpStatus) : "-"} />
            <DebugRow label="마지막 결과" value={data.lastTrace ? (data.lastTrace.ok ? "OK" : `FAIL — ${data.lastTrace.errorMessage ?? ""}`) : "-"} tone={data.lastTrace ? (data.lastTrace.ok ? "ok" : "err") : "none"} />
            <DebugRow label="시각" value={data.lastTrace?.at ?? "-"} />
          </div>
        </div>
        {data.lastTrace?.requestBody && (
          <div className="mt-3">
            <div className="text-[11px] text-ink-500 mb-1">마지막 요청 body</div>
            <pre className="text-[11px] font-mono p-2 bg-bg-panel border border-border rounded overflow-x-auto whitespace-pre-wrap break-all">{data.lastTrace.requestBody}</pre>
          </div>
        )}
        {data.lastTrace?.responseBody && (
          <div className="mt-3">
            <div className="text-[11px] text-ink-500 mb-1">마지막 응답 body</div>
            <pre className="text-[11px] font-mono p-2 bg-bg-panel border border-border rounded overflow-x-auto whitespace-pre-wrap break-all">{data.lastTrace.responseBody}</pre>
          </div>
        )}
      </div>

      {/* Sheet ID — for OAuth/service-account future */}
      <div className="panel panel-pad mb-4">
        <h2 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <FileSpreadsheet size={14} /> Sheet ID <span className="text-xs font-normal text-ink-500">(OAuth/서비스계정용, Apps Script 모드에서는 불필요)</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <label className="label">GOOGLE_SHEET_ID</label>
            <input className="input font-mono text-xs"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              disabled={inEnvSheet} />
          </div>
          <button className="btn-ghost" onClick={saveSheetId} disabled={busy !== null || inEnvSheet}>
            {busy === "save-sheet" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            저장
          </button>
        </div>
        {data.sheetIdEffective && (
          <div className="mt-2 text-xs text-ink-600">
            적용된 Sheet ID: <span className="font-mono text-ink-900">{data.sheetIdEffective}</span>
            <a href={`https://docs.google.com/spreadsheets/d/${data.sheetIdEffective}/edit`} target="_blank" rel="noreferrer"
               className="text-beige-600 hover:underline inline-flex items-center gap-0.5 ml-1">
              열기 <ExternalLink size={11} />
            </a>
          </div>
        )}
      </div>

      {/* Initializer */}
      <div className="panel panel-pad mb-4">
        <h2 className="text-sm font-semibold text-ink-900 mb-2 flex items-center gap-2">
          <Wand2 size={14} className="text-emerald-600" /> Google Sheets 초기화
        </h2>
        <p className="text-xs text-ink-500 mb-3 leading-relaxed">
          연결된 Google Sheets에 ERP에 필요한 14개 탭과 헤더가 없으면 자동으로 생성합니다.{" "}
          기존 데이터가 있는 시트는 <b>건드리지 않습니다</b> (헤더가 이미 있으면 skip).
          빈 시트는 헤더만 추가합니다.
        </p>
        <button className="btn-primary" onClick={initializeSheets}
          disabled={busy !== null || isMock}
          title={isMock ? "Apps Script 모드에서만 동작합니다." : undefined}>
          {busy === "init" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Google Sheets 초기화
        </button>
        {isMock && <span className="ml-2 text-xs text-ink-500">Apps Script 모드가 활성화되어야 합니다.</span>}

        {initResult && (
          <div className={`mt-4 p-3 border rounded-md ${
            initResult.ok && (initResult.counts?.error ?? 0) === 0
              ? "border-emerald-300 bg-emerald-50/40"
              : "border-amber-300 bg-amber-50/40"
          }`}>
            {initResult.error && (
              <div className="text-sm text-red-800 mb-2 flex items-start gap-1.5">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {initResult.error}
              </div>
            )}
            {initResult.counts && (
              <div className="text-sm text-ink-800 mb-2">
                생성 <b>{initResult.counts.created}</b> · 헤더 추가 <b>{initResult.counts.header_added}</b> ·
                {" "}이미 존재 <b>{initResult.counts.skipped}</b> · 오류 <b className={initResult.counts.error ? "text-red-700" : ""}>{initResult.counts.error}</b>
              </div>
            )}
            {initResult.results && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="table-th">시트</th><th className="table-th">상태</th><th className="table-th">메시지</th></tr></thead>
                  <tbody>
                    {initResult.results.map((r) => (
                      <tr key={r.sheetName}>
                        <td className="table-td font-mono text-xs">{r.sheetName}</td>
                        <td className="table-td">
                          {r.status === "created" && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">생성</span>}
                          {r.status === "header-added" && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">헤더 추가</span>}
                          {r.status === "skipped" && <span className="text-xs px-1.5 py-0.5 rounded bg-bg-subtle text-ink-600 border border-border">이미 존재</span>}
                          {r.status === "error" && <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">오류</span>}
                        </td>
                        <td className="table-td text-ink-700">{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab structure reference */}
      <div className="panel panel-pad">
        <h2 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
          <FileSpreadsheet size={14} /> 탭 구조 (참고)
        </h2>
        <p className="text-xs text-ink-500 mb-3">
          앱이 현재 사용 중인 시트 탭 이름. 초기화 버튼은 위에서 별도로 정의된 14개 캐노니컬 탭을 생성합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className="table-th">엔티티 키</th><th className="table-th">탭 이름</th></tr></thead>
            <tbody>
              {Object.entries(data.tabs).map(([k, n]) => (
                <tr key={k}><td className="table-td font-mono text-xs text-ink-600">{k}</td><td className="table-td font-mono">{n}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-ink-500 flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0" />
          쓰기 동작(저장/삭제)이 Apps Script에서 작동하려면 doPost에 <code className="font-mono">findRow/appendRow/updateRow/initializeSheets</code> 액션이 구현되어 있어야 합니다.
          (저장소의 <code className="font-mono">docs/apps-script-handlers.gs</code> 참고)
        </div>
      </div>
    </div>
  );
}

function DebugRow({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "ok" | "err" | "none" }) {
  const toneCls = tone === "ok" ? "text-emerald-700" : tone === "err" ? "text-red-700" : "text-ink-800";
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-500 shrink-0 w-32">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${toneCls} break-all`}>{value}</span>
    </div>
  );
}
