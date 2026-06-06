"use client";

import { useState } from "react";
import { Download, Upload, FileSpreadsheet, ArrowLeftRight, ExternalLink, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD } from "@/components/Table";
import { filterHiddenColumns } from "@/lib/hiddenUIFields";

type Tab = { key: string; tabName: string; rowCount: number; headers: string[] };
type Initial = { tabs: Tab[]; sheetId: string };

export default function SyncClient({ initial }: { initial: Initial }) {
  const [tabs, setTabs] = useState<Tab[]>(initial.tabs);
  const [sheetId] = useState<string>(initial.sheetId);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  async function refresh() {
    const r = await fetch("/api/sync/manifest");
    const j = await r.json();
    setTabs(j.tabs);
  }

  function downloadOne(key: string) {
    // Open in same tab using a hidden link so the Content-Disposition header takes effect
    const a = document.createElement("a");
    a.href = `/api/sync/csv?key=${encodeURIComponent(key)}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function downloadAll() {
    for (let i = 0; i < tabs.length; i++) {
      downloadOne(tabs[i].key);
      // Small gap so browsers register each download separately
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async function uploadOne(key: string, file: File) {
    setUploading(key);
    setUploadResult((p) => ({ ...p, [key]: { ok: false, message: "" } }));
    try {
      const text = await file.text();
      const res = await fetch(`/api/sync/csv?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "text/csv; charset=utf-8" },
        body: text,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setUploadResult((p) => ({ ...p, [key]: { ok: false, message: json.error ?? "가져오기 실패" } }));
      } else {
        const warns: string[] = [];
        if (json.missingHeaders?.length) warns.push(`누락 헤더: ${json.missingHeaders.join(", ")}`);
        if (json.extraHeaders?.length) warns.push(`추가 헤더(무시): ${json.extraHeaders.join(", ")}`);
        const msg = `가져오기 성공 — ${json.imported}행 적용됨${warns.length ? "  · " + warns.join(" · ") : ""}`;
        setUploadResult((p) => ({ ...p, [key]: { ok: true, message: msg } }));
        await refresh();
      }
    } finally {
      setUploading(null);
    }
  }

  const sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null;

  return (
    <div>
      <PageHeader
        title="CSV 동기화"
        description="현재 단계의 Google Sheets 연결 방식 — CSV로 내보내고 다시 가져옵니다. OAuth/서비스 계정 키 불필요."
      />

      {/* Sheet ID summary */}
      <div className="panel panel-pad mb-4 border border-beige-300 bg-beige-50/60">
        <div className="flex items-start gap-3">
          <ArrowLeftRight size={18} className="text-beige-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-900">수동 CSV 동기화 모드</div>
            <p className="text-sm text-ink-700 mt-1 leading-relaxed">
              앱의 데이터는 메모리에서 동작합니다. 아래 "내보내기"로 11개 탭을 CSV로 다운로드 → Google Sheets에서 <b>파일 → 가져오기 → 업로드</b>로 붙여 넣으세요.
              반대로 시트를 수정한 뒤에는 <b>파일 → 다운로드 → CSV</b>로 받아 아래 "가져오기"에 업로드하면 앱 데이터가 교체됩니다.
            </p>
            {sheetUrl ? (
              <a href={sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-beige-700 hover:underline mt-2">
                연결된 Google Sheets 열기 <ExternalLink size={11} />
              </a>
            ) : (
              <p className="text-xs text-amber-700 mt-2">
                Sheet ID가 아직 입력되지 않았습니다 — <a href="/settings/sheets" className="underline">설정 페이지</a>에서 입력하세요. CSV 동기화 자체는 Sheet ID 없이도 동작합니다.
              </p>
            )}
          </div>
          <button onClick={refresh} className="btn-ghost text-xs"><RefreshCw size={12} /> 새로고침</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ─── Export ──────────────────────────────────────── */}
        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Download size={14} className="text-ink-500" /> 현재 데이터를 Google Sheets 형식으로 내보내기
            </h2>
            <button className="btn-primary text-xs" onClick={downloadAll}>
              <Download size={12} /> 전체 다운로드 ({tabs.length}개)
            </button>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>탭 이름</TH>
                <TH>엔티티 키</TH>
                <TH className="text-right">행 수</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {tabs.map((t) => (
                <TR key={t.key}>
                  <TD className="font-mono">{t.tabName}</TD>
                  <TD className="font-mono text-xs text-ink-600">{t.key}</TD>
                  <TD className="text-right tabular-nums">{t.rowCount}</TD>
                  <TD className="text-right">
                    <button onClick={() => downloadOne(t.key)} className="btn-ghost text-xs">
                      <Download size={12} /> CSV
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="px-4 py-3 text-[11px] text-ink-500 border-t border-border leading-relaxed">
            팁: Google Sheets에서 <b>파일 → 가져오기 → 업로드</b> 후 "현재 시트 바꾸기" 또는 "현재 시트에 추가"를 선택하세요. UTF-8 BOM 포함이라 한글이 정상 표시됩니다.
          </div>
        </div>

        {/* ─── Import ──────────────────────────────────────── */}
        <div className="panel">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Upload size={14} className="text-ink-500" /> Google Sheets에서 데이터 가져오기
            </h2>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>탭 이름</TH>
                <TH className="text-right">현재 행 수</TH>
                <TH>CSV 업로드</TH>
              </TR>
            </THead>
            <TBody>
              {tabs.map((t) => {
                const result = uploadResult[t.key];
                const isUp = uploading === t.key;
                return (
                  <TR key={t.key}>
                    <TD className="font-mono align-top">{t.tabName}</TD>
                    <TD className="text-right tabular-nums align-top">{t.rowCount}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          disabled={isUp}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadOne(t.key, f);
                            e.currentTarget.value = "";
                          }}
                          className="text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border file:border-border file:bg-bg-subtle file:text-ink-700 file:cursor-pointer"
                        />
                        {isUp && <Loader2 size={14} className="animate-spin text-ink-500" />}
                      </div>
                      {result && (
                        <div className={`mt-1 text-[11px] flex items-start gap-1 ${result.ok ? "text-emerald-700" : "text-amber-700"}`}>
                          {result.ok
                            ? <CheckCircle2 size={11} className="mt-0.5 shrink-0" />
                            : <AlertTriangle size={11} className="mt-0.5 shrink-0" />}
                          <span>{result.message}</span>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="px-4 py-3 text-[11px] text-ink-500 border-t border-border leading-relaxed">
            업로드한 CSV는 해당 탭의 메모리 데이터를 <b>전체 교체</b>합니다 (행 단위 병합 아님). 헤더는 첫 행이며 컬럼 순서는 자유, 컬럼 이름만 정확히 일치하면 됩니다.
          </div>
        </div>
      </div>

      {/* Schema reference */}
      <div className="panel mt-4">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
            <FileSpreadsheet size={14} className="text-ink-500" /> 탭별 컬럼 구조
          </h2>
        </div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {tabs.map((t) => (
            <div key={t.key} className="border border-border rounded-lg p-3 bg-bg-subtle/30">
              <div className="text-sm font-semibold text-ink-900 font-mono">{t.tabName}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {/* Filter hidden UI fields BEFORE rendering — see lib/hiddenUIFields. */}
                {filterHiddenColumns(t.tabName, t.headers).map((h) => (
                  <span key={h} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-bg-panel border border-border text-ink-700">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
