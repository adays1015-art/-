"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Save, X, Search, Printer, Download, FileText,
  Trash2, ChevronLeft, ChevronRight, CalendarDays, Pencil,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import type { WeeklyReport, WeeklyReportStatus } from "@/types";
import { WEEKLY_REPORT_STATUSES } from "@/types";
import { formatDateKst, todayISO } from "@/lib/utils";

// ─── week helpers (UTC anchored — no TZ drift on YYYY-MM-DD) ──
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 주어진 날짜가 속한 주의 월요일(YYYY-MM-DD). */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const dow = d.getUTCDay();            // 0=일 .. 6=토
  const diff = dow === 0 ? -6 : 1 - dow; // 일요일은 직전 월요일로
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
/** "2026-06-15 ~ 2026-06-21 (6월 3주)" 형태의 라벨. */
function weekLabel(weekStart: string): string {
  if (!weekStart) return "";
  const end = addDaysISO(weekStart, 6);
  const d = new Date(`${weekStart}T00:00:00Z`);
  const month = d.getUTCMonth() + 1;
  // 해당 월의 몇 번째 주 (월요일 기준)
  const firstMonday = mondayOf(`${d.getUTCFullYear()}-${String(month).padStart(2, "0")}-01`);
  const weekNo = Math.floor((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${firstMonday}T00:00:00Z`)) / (7 * 86400000)) + 1;
  return `${weekStart} ~ ${end} · ${month}월 ${Math.max(weekNo, 1)}주`;
}

function statusBadge(status: WeeklyReportStatus): string {
  if (status === "제출") return "bg-ink-900 text-bg";
  return "bg-beige-200 text-ink-900";
}

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}
function escapeHtml(v: string | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

type Draft = {
  weekStart: string;
  author: string;
  department: string;
  thisWeek: string;
  nextWeek: string;
  issues: string;
  note: string;
  status: WeeklyReportStatus;
};

function emptyDraft(): Draft {
  return {
    weekStart: mondayOf(todayISO()),
    author: "",
    department: "",
    thisWeek: "",
    nextWeek: "",
    issues: "",
    note: "",
    status: "작성중",
  };
}

export default function WeeklyReportsClient({
  initialReports,
}: { initialReports: WeeklyReport[] }) {
  const router = useRouter();
  const [reports, setReports] = useState<WeeklyReport[]>(initialReports);
  useEffect(() => { setReports(initialReports); }, [initialReports]);

  const { save, saving, error, clearError, retry } = useResourceSave("/api/weekly-reports");

  // ─── filters ────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports
      .filter((r) => showDeleted || r.status !== "삭제됨")
      .filter((r) => {
        if (!q) return true;
        return (
          r.author.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.thisWeek.toLowerCase().includes(q) ||
          r.nextWeek.toLowerCase().includes(q) ||
          r.issues.toLowerCase().includes(q) ||
          (r.weekStart || "").includes(q)
        );
      })
      .slice()
      .sort((a, b) =>
        (b.weekStart || "").localeCompare(a.weekStart || "") ||
        (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [reports, query, showDeleted]);

  // ─── selection ──────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  // ─── form (create / edit) ───────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormOpen(true);
  }
  function openEdit(r: WeeklyReport) {
    setEditingId(r.id);
    setDraft({
      weekStart: r.weekStart || mondayOf(todayISO()),
      author: r.author,
      department: r.department,
      thisWeek: r.thisWeek,
      nextWeek: r.nextWeek,
      issues: r.issues,
      note: r.note,
      status: r.status === "삭제됨" ? "작성중" : r.status,
    });
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }
  function shiftWeek(n: number) {
    setDraft((d) => ({ ...d, weekStart: addDaysISO(mondayOf(d.weekStart), n * 7) }));
  }

  async function submitForm() {
    const weekStart = mondayOf(draft.weekStart);
    if (!draft.author.trim()) return;
    const payload = {
      ...draft,
      weekStart,
      weekEnd: addDaysISO(weekStart, 6),
    };
    if (editingId) {
      const res = await save<WeeklyReport>("POST", { action: "update", id: editingId, patch: payload });
      if (!res.ok) return;
      if (res.data) {
        const u = res.data;
        setReports((arr) => arr.map((r) => (r.id === editingId ? u : r)));
      }
    } else {
      const res = await save<WeeklyReport>("POST", { action: "create", data: payload });
      if (!res.ok) return;
      if (res.data) {
        setReports((arr) => [...arr, res.data!]);
        setSelectedId(res.data.id);
      }
    }
    closeForm();
    router.refresh();
  }

  async function removeReport(r: WeeklyReport) {
    if (!confirm(`${r.author}님의 주간보고(${r.weekStart})를 삭제할까요?`)) return;
    const res = await save<WeeklyReport>("POST", { action: "delete", id: r.id });
    if (!res.ok) return;
    if (res.data) {
      const u = res.data;
      setReports((arr) => arr.map((x) => (x.id === r.id ? u : x)));
    }
    if (selectedId === r.id) setSelectedId("");
    router.refresh();
  }

  // ─── exports ────────────────────────────────────────────
  function exportCsv() {
    const header = ["주시작일", "주종료일", "작성자", "부서", "이번주업무", "다음주계획", "특이사항", "비고", "상태", "수정일시"];
    const lines = [header.map(escapeCsv).join(",")];
    for (const r of visible) {
      lines.push([
        r.weekStart, r.weekEnd, r.author, r.department,
        r.thisWeek, r.nextWeek, r.issues, r.note, r.status, r.updatedAt,
      ].map(escapeCsv).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `weekly-reports-${todayISO()}.csv`);
  }

  function exportWord(r: WeeklyReport) {
    const rows = [
      ["대상 주간", weekLabel(r.weekStart)],
      ["작성자", r.author],
      ["부서 / 팀", r.department],
      ["상태", r.status],
      ["이번 주 수행 업무", escapeHtml(r.thisWeek)],
      ["다음 주 계획", escapeHtml(r.nextWeek)],
      ["특이사항 / 이슈", escapeHtml(r.issues)],
      ["기타 비고", escapeHtml(r.note)],
    ];
    const body = rows.map(([k, v]) =>
      `<tr><th style="background:#f2efe6;text-align:left;width:150px;vertical-align:top;padding:8px;border:1px solid #ccc;">${k}</th>` +
      `<td style="padding:8px;border:1px solid #ccc;vertical-align:top;">${v || "—"}</td></tr>`).join("");
    const html =
      `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>주간 작업보고서</title></head><body>` +
      `<h2 style="font-family:'Malgun Gothic',sans-serif;">주간 작업보고서</h2>` +
      `<table style="border-collapse:collapse;width:100%;font-family:'Malgun Gothic',sans-serif;font-size:13px;">${body}</table>` +
      `<p style="font-family:'Malgun Gothic',sans-serif;font-size:11px;color:#888;margin-top:16px;">작성일시: ${formatDateKst(r.createdAt)} · 수정일시: ${formatDateKst(r.updatedAt)}</p>` +
      `</body></html>`;
    const blob = new Blob(["﻿" + html], { type: "application/msword;charset=utf-8" });
    triggerDownload(blob, `주간보고_${r.author || "보고서"}_${r.weekStart}.doc`);
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="daily-report-root">
      <PageHeader
        title="주간 작업보고서"
        description="개인별 주간 업무를 직접 작성해 보관합니다. 작성한 보고서는 Google Sheets(주간작업보고)에 저장되며 인쇄 · Word · CSV로 내보낼 수 있습니다."
        actions={
          <div className="flex items-center gap-2 no-print">
            <button className="btn-ghost" onClick={exportCsv} title="목록 전체 CSV 내보내기">
              <Download size={14} /> CSV
            </button>
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={14} /> 주간보고 작성
            </button>
          </div>
        }
      />
      <SaveErrorPanel error={error} onClose={clearError} onRetry={() => retry()} retrying={saving} />

      {/* ─── 작성 / 수정 폼 ─────────────────────────────── */}
      {formOpen && (
        <div className="panel panel-pad mb-5 no-print">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-900">
              {editingId ? "주간보고 수정" : "새 주간보고 작성"}
            </h2>
            <button className="btn-ghost" onClick={closeForm}><X size={14} /> 닫기</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">대상 주간 (월요일 기준)</label>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost px-2" onClick={() => shiftWeek(-1)} title="이전 주">
                  <ChevronLeft size={14} />
                </button>
                <input
                  type="date"
                  className="input"
                  value={draft.weekStart}
                  onChange={(e) => setDraft((d) => ({ ...d, weekStart: e.target.value }))}
                />
                <button type="button" className="btn-ghost px-2" onClick={() => shiftWeek(1)} title="다음 주">
                  <ChevronRight size={14} />
                </button>
              </div>
              <p className="text-[11px] text-ink-500 mt-1 flex items-center gap-1">
                <CalendarDays size={11} /> {weekLabel(mondayOf(draft.weekStart))}
              </p>
            </div>
            <div>
              <label className="label">작성자 *</label>
              <input className="input" placeholder="이름"
                value={draft.author}
                onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))} />
            </div>
            <div>
              <label className="label">부서 / 팀</label>
              <input className="input" placeholder="예: 생산팀, 영업팀"
                value={draft.department}
                onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">이번 주 수행 업무</label>
              <textarea className="input" rows={5}
                placeholder="한 일을 줄바꿈으로 정리"
                value={draft.thisWeek}
                onChange={(e) => setDraft((d) => ({ ...d, thisWeek: e.target.value }))} />
            </div>
            <div>
              <label className="label">다음 주 계획</label>
              <textarea className="input" rows={5}
                placeholder="다음 주에 할 일"
                value={draft.nextWeek}
                onChange={(e) => setDraft((d) => ({ ...d, nextWeek: e.target.value }))} />
            </div>
            <div>
              <label className="label">특이사항 / 이슈</label>
              <textarea className="input" rows={3}
                placeholder="업무 특이사항, 협조 요청, 리스크 등"
                value={draft.issues}
                onChange={(e) => setDraft((d) => ({ ...d, issues: e.target.value }))} />
            </div>
            <div>
              <label className="label">기타 비고</label>
              <textarea className="input" rows={3}
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="label !mb-0">상태</label>
              <select className="input !w-auto"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as WeeklyReportStatus }))}>
                {WEEKLY_REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost" onClick={closeForm}>취소</button>
              <button className="btn-primary" onClick={submitForm} disabled={saving || !draft.author.trim()}>
                <Save size={14} /> {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
        {/* ─── 목록 ──────────────────────────────────────── */}
        <div className="no-print">
          <div className="panel mb-3">
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="label flex items-center gap-2"><Search size={12} /> 검색</label>
                <input className="input"
                  placeholder="작성자 · 부서 · 업무 내용 · 주차"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)} />
              </div>
              <label className="text-xs text-ink-600 flex items-center gap-1.5 pb-2">
                <input type="checkbox" checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)} />
                삭제 포함
              </label>
            </div>
          </div>

          <div className="panel overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>대상 주간</TH>
                  <TH>작성자</TH>
                  <TH>부서</TH>
                  <TH>상태</TH>
                  <TH className="text-right">관리</TH>
                </TR>
              </THead>
              <TBody>
                {visible.length === 0 ? (
                  <TR><TD><Empty>작성된 주간보고가 없습니다.</Empty></TD></TR>
                ) : visible.map((r) => (
                  <TR key={r.id}
                    highlight={r.id === selectedId}
                    onClick={() => setSelectedId(r.id)}>
                    <TD>
                      <div className="font-medium text-ink-900">{r.weekStart}</div>
                      <div className="text-[11px] text-ink-500">~ {r.weekEnd}</div>
                    </TD>
                    <TD>{r.author || "—"}</TD>
                    <TD>{r.department || "—"}</TD>
                    <TD>
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-ghost px-2 py-1" title="수정"
                          onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn-ghost px-2 py-1" title="삭제"
                          onClick={(e) => { e.stopPropagation(); removeReport(r); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>

        {/* ─── 상세 / 미리보기 (인쇄 대상) ───────────────── */}
        <div>
          {selected ? (
            <div className="panel panel-pad report-section">
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <div className="text-[11px] font-medium tracking-[0.18em] text-ink-500 uppercase">
                    Weekly Work Report
                  </div>
                  <h2 className="text-lg font-semibold text-ink-900 mt-0.5">주간 작업보고서</h2>
                  <p className="text-sm text-ink-600 mt-1">{weekLabel(selected.weekStart)}</p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button className="btn-ghost" onClick={() => openEdit(selected)}>
                    <Pencil size={14} /> 수정
                  </button>
                  <button className="btn-ghost" onClick={() => exportWord(selected)} title="Word 문서로 저장">
                    <FileText size={14} /> Word
                  </button>
                  <button className="btn-primary" onClick={() => window.print()} title="인쇄 / PDF 저장">
                    <Printer size={14} /> 인쇄
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div><span className="text-ink-500">작성자</span><div className="font-medium text-ink-900">{selected.author || "—"}</div></div>
                <div><span className="text-ink-500">부서 / 팀</span><div className="font-medium text-ink-900">{selected.department || "—"}</div></div>
              </div>

              <ReportField label="이번 주 수행 업무" value={selected.thisWeek} />
              <ReportField label="다음 주 계획" value={selected.nextWeek} />
              <ReportField label="특이사항 / 이슈" value={selected.issues} />
              <ReportField label="기타 비고" value={selected.note} />

              <div className="mt-4 pt-3 border-t border-border text-[11px] text-ink-400">
                작성: {formatDateKst(selected.createdAt)} · 수정: {formatDateKst(selected.updatedAt)} · 상태: {selected.status}
              </div>
            </div>
          ) : (
            <div className="panel panel-pad text-center text-sm text-ink-500 no-print">
              왼쪽 목록에서 주간보고를 선택하면 상세 내용과 인쇄 · Word 내보내기를 사용할 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-section mb-3">
      <div className="text-xs font-semibold text-ink-700 mb-1">{label}</div>
      <div className="text-sm text-ink-800 whitespace-pre-wrap rounded-md border border-border bg-bg-subtle px-3 py-2 min-h-[2.5rem]">
        {value?.trim() ? value : <span className="text-ink-400">—</span>}
      </div>
    </div>
  );
}
