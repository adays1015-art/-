"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Save, X, Search, ChevronLeft, ChevronRight, CalendarDays,
  Pencil, CheckCheck, AlertCircle, Trash2,
} from "lucide-react";
import type { WeeklyReport, ReportStatus, Session, ReportActivity, ReportKeyword } from "@/lib/types";
import { REPORT_KEYWORDS } from "@/lib/types";
import { addDaysISO, mondayOf, weekLabel, todayISO, formatDateTime } from "@/lib/week";

function keywordStyle(k: string): string {
  switch (k) {
    case "출장": return "bg-status-progress/10 text-status-progress border-status-progress/30";
    case "외근": return "bg-beige-300 text-ink-900 border-beige-400";
    case "중요": return "bg-status-danger/10 text-status-danger border-status-danger/30";
    case "기타": return "bg-bg-subtle text-ink-600 border-border";
    default: return "bg-status-done/10 text-status-done border-status-done/30"; // 업무
  }
}

type Draft = {
  weekStart: string; activities: ReportActivity[]; nextWeek: string; issues: string; status: ReportStatus;
};
function emptyDraft(): Draft {
  return {
    weekStart: mondayOf(todayISO()),
    activities: [{ date: todayISO(), keyword: "업무", content: "" }],
    nextWeek: "", issues: "", status: "제출",
  };
}

export default function ReportsClient({
  initialReports, session, initialOpenId = "",
}: { initialReports: WeeklyReport[]; session: Session; initialOpenId?: string }) {
  const router = useRouter();
  const isManager = session.role === "관리자";
  const [reports, setReports] = useState<WeeklyReport[]>(initialReports);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 팀원은 본인 것만, 관리자는 전체
  const mine = useMemo(
    () => isManager ? reports : reports.filter((r) => r.author === session.name && r.team === session.team),
    [reports, isManager, session]);

  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter((r) => !q ||
      r.author.toLowerCase().includes(q) || r.team.toLowerCase().includes(q) ||
      r.thisWeek.toLowerCase().includes(q) || (r.weekStart || "").includes(q) ||
      (r.activities || []).some((a) => a.content.toLowerCase().includes(q) || a.keyword.includes(q)));
  }, [mine, query]);

  const [selectedId, setSelectedId] = useState<string>(initialOpenId);
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [note, setNote] = useState("");

  function openCreate() { setEditingId(null); setDraft(emptyDraft()); setFormOpen(true); }
  function openEdit(r: WeeklyReport) {
    setEditingId(r.id);
    const acts = (r.activities && r.activities.length)
      ? r.activities
      : (r.thisWeek ? [{ date: r.weekStart || todayISO(), keyword: "업무" as ReportKeyword, content: r.thisWeek }] : [{ date: todayISO(), keyword: "업무" as ReportKeyword, content: "" }]);
    setDraft({ weekStart: r.weekStart || mondayOf(todayISO()), activities: acts, nextWeek: r.nextWeek, issues: r.issues, status: r.status === "확인됨" ? "제출" : r.status });
    setFormOpen(true);
  }

  // 활동 항목 편집
  function updateAct(i: number, patch: Partial<ReportActivity>) {
    setDraft((d) => ({ ...d, activities: d.activities.map((a, idx) => idx === i ? { ...a, ...patch } : a) }));
  }
  function addAct() {
    setDraft((d) => ({ ...d, activities: [...d.activities, { date: d.weekStart, keyword: "업무", content: "" }] }));
  }
  function removeAct(i: number) {
    setDraft((d) => ({ ...d, activities: d.activities.filter((_, idx) => idx !== i) }));
  }

  async function post(body: unknown): Promise<WeeklyReport | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "오류가 발생했습니다."); return null; }
      return (json.data as WeeklyReport) ?? null;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }

  async function submitForm() {
    const weekStart = mondayOf(draft.weekStart);
    const activities = draft.activities.filter((a) => a.content.trim());
    const payload = {
      weekStart, weekEnd: addDaysISO(weekStart, 6),
      team: session.team, author: session.name,
      thisWeek: "", activities, nextWeek: draft.nextWeek, issues: draft.issues, status: draft.status,
    };
    if (editingId) {
      const u = await post({ action: "update", id: editingId, patch: payload });
      if (!u) return;
      setReports((arr) => arr.map((r) => (r.id === editingId ? u : r)));
    } else {
      const c = await post({ action: "create", data: payload });
      if (!c) return;
      setReports((arr) => [c, ...arr]);
      setSelectedId(c.id);
    }
    setFormOpen(false); setEditingId(null);
    router.refresh();
  }

  async function confirm(r: WeeklyReport) {
    const u = await post({ action: "confirm", id: r.id, patch: { managerNote: note } });
    if (!u) return;
    setReports((arr) => arr.map((x) => (x.id === r.id ? u : x)));
    setNote("");
    router.refresh();
  }

  function shiftWeek(n: number) { setDraft((d) => ({ ...d, weekStart: addDaysISO(mondayOf(d.weekStart), n * 7) })); }

  return (
    <div className="report-root">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">주간 작업보고</h1>
          <p className="text-sm text-ink-600 mt-1">
            {isManager
              ? "전체 팀의 주간보고를 열람하고 확인 처리합니다."
              : `${session.team || "내"} · ${session.name} 님의 주간 업무를 작성·제출합니다.`}
          </p>
        </div>
        {!isManager && (
          <button className="btn-primary" onClick={openCreate}><Plus size={14} /> 주간보고 작성</button>
        )}
      </div>

      {error && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-sm text-ink-800">
          <AlertCircle size={16} className="text-status-danger mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-ink-400 hover:text-ink-700"><X size={14} /></button>
        </div>
      )}

      {formOpen && (
        <div className="panel panel-pad mb-5 no-print">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-900">{editingId ? "주간보고 수정" : "새 주간보고 작성"}</h2>
            <button className="btn-ghost" onClick={() => { setFormOpen(false); setEditingId(null); }}><X size={14} /> 닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">대상 주간 (월요일 기준)</label>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost px-2" onClick={() => shiftWeek(-1)}><ChevronLeft size={14} /></button>
                <input type="date" className="input" value={draft.weekStart} onChange={(e) => setDraft((d) => ({ ...d, weekStart: e.target.value }))} />
                <button type="button" className="btn-ghost px-2" onClick={() => shiftWeek(1)}><ChevronRight size={14} /></button>
              </div>
              <p className="text-[11px] text-ink-500 mt-1 flex items-center gap-1"><CalendarDays size={11} /> {weekLabel(mondayOf(draft.weekStart))}</p>
            </div>
            <div>
              <label className="label">팀</label>
              <input className="input bg-bg-subtle" value={session.team} readOnly />
            </div>
            <div>
              <label className="label">작성자</label>
              <input className="input bg-bg-subtle" value={session.name} readOnly />
            </div>
          </div>
          {/* 활동 항목: 날짜 + 키워드 + 내용 */}
          <div className="mb-3">
            <label className="label">이번 주 업무 (날짜 · 키워드 · 내용)</label>
            <div className="space-y-2">
              {draft.activities.map((a, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input type="date" className="input sm:w-40" value={a.date} onChange={(e) => updateAct(i, { date: e.target.value })} />
                  <select className="input sm:w-28" value={a.keyword} onChange={(e) => updateAct(i, { keyword: e.target.value as ReportKeyword })}>
                    {REPORT_KEYWORDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <input className="input flex-1" placeholder="한 일 / 활동 내용" value={a.content} onChange={(e) => updateAct(i, { content: e.target.value })} />
                  <button type="button" className="btn-ghost px-2 shrink-0" onClick={() => removeAct(i)} title="삭제"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost mt-2" onClick={addAct}><Plus size={14} /> 항목 추가</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">다음 주 계획</label>
              <textarea className="input" rows={3} placeholder="다음 주에 할 일" value={draft.nextWeek} onChange={(e) => setDraft((d) => ({ ...d, nextWeek: e.target.value }))} />
            </div>
            <div>
              <label className="label">이슈 / 특이사항</label>
              <textarea className="input" rows={3} placeholder="협조 요청, 리스크 등 (있으면 관리자 대시보드에 강조)" value={draft.issues} onChange={(e) => setDraft((d) => ({ ...d, issues: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setFormOpen(false); setEditingId(null); }}>취소</button>
            <button className="btn-primary" onClick={submitForm} disabled={busy}><Save size={14} /> {busy ? "저장 중…" : "제출"}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div className="no-print">
          <div className="panel mb-3 px-4 py-3">
            <label className="label flex items-center gap-2"><Search size={12} /> 검색</label>
            <input className="input" placeholder="작성자 · 팀 · 내용 · 주차" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="panel overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr>
                <th className="table-th">주간</th><th className="table-th">작성자</th>
                <th className="table-th">팀</th><th className="table-th">상태</th>
              </tr></thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td className="table-td text-center text-ink-400 py-8" colSpan={4}>보고가 없습니다.</td></tr>
                ) : visible.map((r) => (
                  <tr key={r.id} onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer hover:bg-bg-subtle ${r.id === selectedId ? "bg-bg-subtle" : ""}`}>
                    <td className="table-td">{r.weekStart}</td>
                    <td className="table-td">{r.author}</td>
                    <td className="table-td">{r.team || "—"}</td>
                    <td className="table-td">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium
                        ${r.status === "확인됨" ? "bg-status-done/15 text-status-done"
                          : r.status === "제출" ? "bg-ink-900 text-bg" : "bg-beige-200 text-ink-900"}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          {selected ? (
            <div className="panel panel-pad report-section">
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <div className="text-[11px] font-medium tracking-[0.18em] text-ink-500 uppercase">Weekly Report</div>
                  <h2 className="text-lg font-semibold text-ink-900 mt-0.5">{selected.author} <span className="text-sm text-ink-400">· {selected.team}</span></h2>
                  <p className="text-sm text-ink-600 mt-1">{weekLabel(selected.weekStart)} · {selected.status}</p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  {(isManager || selected.author === session.name) && (
                    <button className="btn-ghost" onClick={() => openEdit(selected)}><Pencil size={14} /> 수정</button>
                  )}
                  <button className="btn-ghost" onClick={() => window.print()}>인쇄</button>
                </div>
              </div>

              <div className="report-section mb-3">
                <div className="text-xs font-semibold text-ink-700 mb-1">이번 주 업무</div>
                {(selected.activities && selected.activities.length) ? (
                  <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
                    {selected.activities.map((a, i) => (
                      <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="text-ink-500 text-[12px] w-20 shrink-0">{a.date?.slice(5) || ""}</span>
                        {a.keyword && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] border ${keywordStyle(a.keyword)}`}>{a.keyword}</span>}
                        <span className="text-ink-800">{a.content}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-ink-800 whitespace-pre-wrap rounded-md border border-border bg-bg-subtle px-3 py-2 min-h-[2.5rem]">
                    {selected.thisWeek?.trim() ? selected.thisWeek : <span className="text-ink-400">—</span>}
                  </div>
                )}
              </div>
              <Field label="다음 주 계획" value={selected.nextWeek} />
              <Field label="이슈 / 특이사항" value={selected.issues} />
              {selected.managerNote && <Field label="관리자 코멘트" value={selected.managerNote} />}

              {isManager && selected.status !== "확인됨" && (
                <div className="no-print mt-2 rounded-md border border-border bg-bg-subtle p-3">
                  <label className="label">관리자 코멘트 (선택)</label>
                  <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="피드백을 남기고 확인 처리하세요" />
                  <div className="flex justify-end mt-2">
                    <button className="btn-primary" onClick={() => confirm(selected)} disabled={busy}><CheckCheck size={14} /> 확인 처리</button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-border text-[11px] text-ink-400">
                작성: {formatDateTime(selected.createdAt)} · 수정: {formatDateTime(selected.updatedAt)}
              </div>
            </div>
          ) : (
            <div className="panel panel-pad text-center text-sm text-ink-500 no-print">
              왼쪽 목록에서 보고를 선택하면 상세 내용을 볼 수 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="report-section mb-3">
      <div className="text-xs font-semibold text-ink-700 mb-1">{label}</div>
      <div className="text-sm text-ink-800 whitespace-pre-wrap rounded-md border border-border bg-bg-subtle px-3 py-2 min-h-[2.5rem]">
        {value?.trim() ? value : <span className="text-ink-400">—</span>}
      </div>
    </div>
  );
}
