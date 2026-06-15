"use client";

import { useMemo, useState } from "react";
import {
  Plus, X, ChevronLeft, ChevronRight, AlertTriangle, Circle, CheckCircle2,
  Trash2, AlertCircle, Flame, Factory, User, Tag, UserMinus, UserCheck,
} from "lucide-react";
import type { Schedule, ScheduleCategory, Member } from "@/lib/types";
import { SCHEDULE_CATEGORIES } from "@/lib/types";
import {
  todayISO, monthGrid, daysBetween, monthOf, formatMonthLabel,
} from "@/lib/week";

const WEEK_HEADERS = ["월", "화", "수", "목", "금", "토", "일"];

function catStyle(cat: string): string {
  switch (cat) {
    case "생산": return "bg-beige-300 text-ink-900 border-beige-400";
    case "회의": return "bg-status-progress/10 text-status-progress border-status-progress/30";
    case "납품": return "bg-status-done/10 text-status-done border-status-done/30";
    case "출장": return "bg-beige-200 text-ink-800 border-beige-300";
    case "점검": return "bg-status-hold/10 text-status-hold border-status-hold/30";
    case "마감": return "bg-status-danger/10 text-status-danger border-status-danger/30";
    default: return "bg-bg-subtle text-ink-700 border-border";
  }
}
function isUrgent(s: Schedule, today: string): boolean {
  if (s.confirmed) return false;
  if (s.urgent) return true;
  const d = daysBetween(today, s.startDate);
  return d >= 0 && d <= 2;
}
function coversDay(s: Schedule, iso: string): boolean {
  const end = s.endDate || s.startDate;
  return s.startDate <= iso && iso <= end;
}

type Draft = {
  startDate: string; endDate: string; title: string;
  assignee: string; category: ScheduleCategory | ""; urgent: boolean;
};
function emptyDraft(date: string): Draft {
  return { startDate: date, endDate: "", title: "", assignee: "", category: "", urgent: false };
}

export default function CalendarDashboard({
  initialSchedules, members = [],
}: { initialSchedules: Schedule[]; members?: Member[] }) {
  const today = todayISO();
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = new Date(`${today}T00:00:00Z`);
  const [viewYear, setViewYear] = useState(now.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth());

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(today));
  function openAdd(date?: string) { setDraft(emptyDraft(date ?? today)); setAddOpen(true); }

  async function post(body: unknown): Promise<Schedule | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "오류가 발생했습니다."); return null; }
      return (json.data as Schedule) ?? null;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }
  async function submitAdd() {
    if (!draft.title.trim()) { setError("제목을 입력하세요."); return; }
    const c = await post({ action: "create", data: { ...draft, title: draft.title.trim() } });
    if (!c) return;
    setSchedules((arr) => [...arr, c]); setAddOpen(false);
  }
  async function toggleConfirm(s: Schedule) {
    const u = await post({ action: "update", id: s.id, patch: { confirmed: !s.confirmed } });
    if (!u) return;
    setSchedules((arr) => arr.map((x) => (x.id === s.id ? u : x)));
  }
  async function remove(s: Schedule) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: s.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "삭제 실패"); return; }
      setSchedules((arr) => arr.filter((x) => x.id !== s.id));
    } finally { setBusy(false); }
  }

  const ym = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthSchedules = useMemo(
    () => schedules.filter((s) => (s.startDate || "").slice(0, 7) === ym),
    [schedules, ym]);
  const important = useMemo(
    () => monthSchedules.filter((s) => s.urgent || isUrgent(s, today)).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [monthSchedules, today]);
  const production = useMemo(
    () => monthSchedules.filter((s) => s.category === "생산").sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [monthSchedules]);
  // 오늘 휴가/출장 = 공석, 나머지 명단 = 근무
  const offReason = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of schedules) {
      if ((s.category === "휴가" || s.category === "출장") && coversDay(s, today) && s.assignee) {
        m.set(s.assignee, s.category);
      }
    }
    return m;
  }, [schedules, today]);
  const absent = useMemo(() => members.filter((mm) => offReason.has(mm.name)), [members, offReason]);
  const working = useMemo(() => members.filter((mm) => !offReason.has(mm.name)), [members, offReason]);

  const cells = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function gotoMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">대시보드</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2" onClick={() => gotoMonth(-1)}><ChevronLeft size={15} /></button>
          <span className="text-sm font-medium text-ink-700 min-w-[88px] text-center">{formatMonthLabel(viewYear, viewMonth)}</span>
          <button className="btn-ghost px-2" onClick={() => gotoMonth(1)}><ChevronRight size={15} /></button>
          <button className="btn-ghost" onClick={() => { setViewYear(now.getUTCFullYear()); setViewMonth(now.getUTCMonth()); }}>오늘</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-sm text-ink-800">
          <AlertCircle size={16} className="text-status-danger mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-ink-400 hover:text-ink-700"><X size={14} /></button>
        </div>
      )}

      {addOpen && (
        <div className="panel panel-pad mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink-900">새 일정 등록</h2>
            <button className="btn-ghost" onClick={() => setAddOpen(false)}><X size={14} /> 닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div><label className="label">시작일</label>
              <input type="date" className="input" value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} /></div>
            <div><label className="label">종료일 (선택)</label>
              <input type="date" className="input" value={draft.endDate} min={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} /></div>
            <div><label className="label">담당자</label>
              <input className="input" placeholder="이름" value={draft.assignee} onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))} /></div>
            <div><label className="label">분류</label>
              <select className="input" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as ScheduleCategory }))}>
                <option value="">미지정</option>
                {SCHEDULE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1"><label className="label">제목</label>
              <input className="input" placeholder="예: 6월 생산 목표, 거래처B 납품" value={draft.title} autoFocus
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") submitAdd(); }} /></div>
            <label className="flex items-center gap-2 text-sm text-ink-700 pb-2 whitespace-nowrap">
              <input type="checkbox" checked={draft.urgent} onChange={(e) => setDraft((d) => ({ ...d, urgent: e.target.checked }))} />
              <Flame size={14} className="text-status-danger" /> 중요/급함
            </label>
            <button className="btn-primary" onClick={submitAdd} disabled={busy || !draft.title.trim()}><Plus size={14} /> 추가</button>
          </div>
        </div>
      )}

      {/* 상단 요약: 월별 중요일정 + 월별 필요생산 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <SummaryPanel
          icon={<AlertTriangle size={15} className="text-status-danger" />}
          title="월별 중요일정" count={important.length}
          empty="이번 달 중요/급한 일정이 없습니다."
          items={important} today={today} onConfirm={toggleConfirm} onRemove={remove} showDday />
        <SummaryPanel
          icon={<Factory size={15} className="text-beige-600" />}
          title="월별 필요생산" count={production.length}
          empty="이번 달 생산 일정이 없습니다. (일정 등록 시 분류를 '생산'으로)"
          items={production} today={today} onConfirm={toggleConfirm} onRemove={remove} />
      </div>

      {/* 2행: 공석자 + 근무자 (오늘 기준) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <NamePanel
          icon={<UserMinus size={15} className="text-status-hold" />}
          title="공석자 (오늘)" count={absent.length}
          empty={members.length ? "오늘 공석인 인원이 없습니다." : "팀원 명단(팀원 시트)을 등록하면 표시됩니다."}
          names={absent.map((m) => ({ name: m.name, team: m.team, note: offReason.get(m.name) }))}
          tone="hold" />
        <NamePanel
          icon={<UserCheck size={15} className="text-status-done" />}
          title="근무자 (오늘)" count={working.length}
          empty={members.length ? "근무 인원이 없습니다." : "팀원 명단(팀원 시트)을 등록하면 표시됩니다."}
          names={working.map((m) => ({ name: m.name, team: m.team }))}
          tone="done" />
      </div>

      {/* 달력 */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-ink-700">월간 일정</h2>
        <button className="btn-primary" onClick={() => openAdd()}><Plus size={14} /> 일정 등록</button>
      </div>
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEK_HEADERS.map((w, i) => (
            <div key={w} className={`px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider bg-bg-subtle
              ${i === 6 ? "text-status-danger" : i === 5 ? "text-status-progress" : "text-ink-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((iso, idx) => {
            const inMonth = monthOf(iso) === viewMonth;
            const isToday = iso === today;
            const dayNum = Number(iso.slice(8, 10));
            const dow = idx % 7;
            const items = schedules.filter((s) => coversDay(s, iso));
            return (
              <button key={iso} onClick={() => openAdd(iso)}
                className={`min-h-[104px] text-left p-1.5 border-b border-r border-border hover:bg-bg-subtle transition-colors
                  ${dow === 6 ? "border-r-0" : ""} ${inMonth ? "" : "bg-bg-subtle/40"}`}>
                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[12px] mb-1
                  ${isToday ? "bg-ink-900 text-bg font-semibold" : !inMonth ? "text-ink-400"
                    : dow === 6 ? "text-status-danger" : dow === 5 ? "text-status-progress" : "text-ink-700"}`}>{dayNum}</div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((s) => (
                    <div key={s.id}
                      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-tight border
                        ${s.confirmed ? "bg-bg-subtle text-ink-400 border-border line-through" : catStyle(s.category)}`}
                      title={`${s.title}${s.assignee ? ` · ${s.assignee}` : ""}`}>
                      {isUrgent(s, today) && <Flame size={10} className="text-status-danger shrink-0" />}
                      <span className="truncate">{s.title}</span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-ink-500 pl-1">+{items.length - 3}건</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-ink-400 mt-2 px-1">날짜 칸을 누르면 그 날짜로 일정을 빠르게 추가할 수 있어요. 위 목록의 ○를 누르면 ‘확인’ 처리됩니다.</p>
    </div>
  );
}

function SummaryPanel({
  icon, title, count, empty, items, today, onConfirm, onRemove, showDday,
}: {
  icon: React.ReactNode; title: string; count: number; empty: string;
  items: Schedule[]; today: string;
  onConfirm: (s: Schedule) => void; onRemove: (s: Schedule) => void; showDday?: boolean;
}) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {icon}
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="ml-auto text-xs text-ink-500">{count}건</span>
      </div>
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-400">{empty}</div>
        ) : items.map((s) => {
          const d = daysBetween(today, s.startDate);
          const dlabel = d === 0 ? "오늘" : d === 1 ? "내일" : d > 0 ? `D-${d}` : "지남";
          return (
            <div key={s.id} className="px-4 py-2.5 flex items-center gap-2 group">
              <button onClick={() => onConfirm(s)} title={s.confirmed ? "확인됨" : "확인 처리"} className="shrink-0">
                {s.confirmed ? <CheckCircle2 size={16} className="text-status-done" /> : <Circle size={16} className="text-ink-300 hover:text-status-done" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${s.confirmed ? "text-ink-400 line-through" : "text-ink-900"}`}>{s.title}</div>
                <div className="text-[11px] text-ink-500 flex items-center gap-1.5 flex-wrap">
                  <span>{s.startDate}{s.endDate && s.endDate !== s.startDate ? `~${s.endDate.slice(5)}` : ""}</span>
                  {s.assignee && <span className="flex items-center gap-0.5"><User size={10} />{s.assignee}</span>}
                  {s.category && <span className="flex items-center gap-0.5"><Tag size={10} />{s.category}</span>}
                </div>
              </div>
              {showDday && !s.confirmed && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-status-danger/10 text-status-danger">{dlabel}</span>
              )}
              <button onClick={() => onRemove(s)} title="삭제"
                className="shrink-0 text-ink-300 hover:text-status-danger opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NamePanel({
  icon, title, count, empty, names, tone,
}: {
  icon: React.ReactNode; title: string; count: number; empty: string;
  names: { name: string; team: string; note?: string }[]; tone: "hold" | "done";
}) {
  const chip = tone === "hold"
    ? "bg-status-hold/10 text-ink-800 border-status-hold/30"
    : "bg-status-done/10 text-ink-800 border-status-done/30";
  return (
    <div className="panel">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        {icon}
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="ml-auto text-xs text-ink-500">{count}명</span>
      </div>
      <div className="px-4 py-3 min-h-[3rem]">
        {names.length === 0 ? (
          <div className="py-3 text-center text-sm text-ink-400">{empty}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {names.map((n) => (
              <span key={`${n.team}-${n.name}`}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] border ${chip}`}
                title={n.team}>
                {n.name}{n.note ? <span className="text-ink-500">· {n.note}</span> : null}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
