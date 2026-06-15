"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Circle,
  Users, FileCheck2, FileClock, X, CheckCheck,
} from "lucide-react";
import type { WeeklyReport, Member } from "@/lib/types";
import { addDaysISO, mondayOf, weekLabel, todayISO } from "@/lib/week";

export default function DashboardClient({
  initialReports, members,
}: { initialReports: WeeklyReport[]; members: Member[] }) {
  const router = useRouter();
  const [reports, setReports] = useState<WeeklyReport[]>(initialReports);
  const [weekStart, setWeekStart] = useState<string>(mondayOf(todayISO()));
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string>("");

  const weekReports = useMemo(
    () => reports.filter((r) => r.weekStart === weekStart),
    [reports, weekStart]);

  // 팀별 그룹
  const teams = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => m.team && set.add(m.team));
    weekReports.forEach((r) => r.team && set.add(r.team));
    return Array.from(set).sort();
  }, [members, weekReports]);

  const submittedByName = useMemo(() => {
    const m = new Map<string, WeeklyReport>();
    for (const r of weekReports) m.set(`${r.team}|${r.author}`, r);
    return m;
  }, [weekReports]);

  // 제출/미제출 집계 (명단이 있을 때만 미제출 계산)
  const submittedCount = weekReports.length;
  const rosterCount = members.length;
  const pending = useMemo(
    () => members.filter((m) => !submittedByName.has(`${m.team}|${m.name}`)),
    [members, submittedByName]);

  // 확인 필요 = 제출됐지만 아직 '확인됨' 아님
  const needConfirm = useMemo(
    () => weekReports.filter((r) => r.status !== "확인됨")
      .sort((a, b) => (a.team || "").localeCompare(b.team || "")),
    [weekReports]);

  // 이슈 있는 보고
  const withIssues = useMemo(
    () => weekReports.filter((r) => r.issues && r.issues.trim()),
    [weekReports]);

  const opened = reports.find((r) => r.id === openId) ?? null;

  async function confirm(r: WeeklyReport) {
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", id: r.id, patch: { managerNote: r.managerNote ?? "" } }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "확인 처리 실패"); return; }
      setReports((arr) => arr.map((x) => (x.id === r.id ? json.data : x)));
      router.refresh();
    } catch (e) { setError((e as Error).message); }
  }

  function shiftWeek(n: number) { setWeekStart((w) => addDaysISO(mondayOf(w), n * 7)); }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">관리자 대시보드</h1>
          <p className="text-sm text-ink-600 mt-1">팀별 주간보고 제출 현황과 확인 필요 항목을 한눈에 봅니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-2" onClick={() => shiftWeek(-1)} title="이전 주"><ChevronLeft size={15} /></button>
          <div className="text-sm font-medium text-ink-800 min-w-[150px] text-center">{weekLabel(weekStart)}</div>
          <button className="btn-ghost px-2" onClick={() => shiftWeek(1)} title="다음 주"><ChevronRight size={15} /></button>
          <button className="btn-ghost" onClick={() => setWeekStart(mondayOf(todayISO()))}>이번 주</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-sm text-ink-800">{error}</div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi icon={<FileCheck2 size={16} />} label="제출" value={`${submittedCount}건`} />
        <Kpi icon={<FileClock size={16} />} label="확인 필요" value={`${needConfirm.length}건`} tone={needConfirm.length ? "danger" : "default"} />
        <Kpi icon={<Users size={16} />} label="미제출" value={rosterCount ? `${pending.length}명` : "—"} tone={pending.length ? "warn" : "default"} />
        <Kpi icon={<AlertTriangle size={16} />} label="이슈" value={`${withIssues.length}건`} tone={withIssues.length ? "warn" : "default"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
        {/* 팀별 제출 현황 */}
        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users size={15} className="text-ink-500" />
            <h2 className="text-sm font-semibold text-ink-900">팀별 제출 현황</h2>
          </div>
          {teams.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-400">이번 주 보고가 아직 없습니다.</div>
          ) : (
            <div className="divide-y divide-border">
              {teams.map((team) => {
                const teamMembers = members.filter((m) => m.team === team);
                const teamReports = weekReports.filter((r) => r.team === team);
                const submittedNames = new Set(teamReports.map((r) => r.author));
                const pendingNames = teamMembers.filter((m) => !submittedNames.has(m.name)).map((m) => m.name);
                return (
                  <div key={team} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-ink-900">{team}</div>
                      <div className="text-xs text-ink-500">
                        {teamMembers.length > 0
                          ? `${submittedNames.size}/${teamMembers.length} 제출`
                          : `${teamReports.length}건 제출`}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {teamReports.map((r) => (
                        <button key={r.id} onClick={() => setOpenId(r.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] border
                            ${r.status === "확인됨"
                              ? "bg-bg-subtle text-ink-500 border-border"
                              : "bg-ink-900 text-bg border-ink-900"}`}>
                          {r.status === "확인됨" ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                          {r.author}
                        </button>
                      ))}
                      {pendingNames.map((n) => (
                        <span key={n} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] border border-dashed border-status-danger/40 text-status-danger/80">
                          {n} · 미제출
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 확인 필요 + 이슈 */}
        <div className="space-y-5">
          <div className="panel">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <FileClock size={15} className="text-status-danger" />
              <h2 className="text-sm font-semibold text-ink-900">확인 필요</h2>
              <span className="ml-auto text-xs text-ink-500">{needConfirm.length}건</span>
            </div>
            <div className="divide-y divide-border">
              {needConfirm.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-ink-400">모두 확인했습니다 👍</div>
              ) : needConfirm.map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex items-center gap-2">
                  <button onClick={() => setOpenId(r.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm text-ink-900">{r.author} <span className="text-ink-400">· {r.team}</span></div>
                    <div className="truncate text-[11px] text-ink-500">{r.thisWeek || "(내용 없음)"}</div>
                  </button>
                  <button className="btn-ghost px-2 py-1 text-[12px]" onClick={() => confirm(r)} title="확인 처리">
                    <CheckCheck size={13} /> 확인
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <AlertTriangle size={15} className="text-status-hold" />
              <h2 className="text-sm font-semibold text-ink-900">이슈 / 특이사항</h2>
              <span className="ml-auto text-xs text-ink-500">{withIssues.length}건</span>
            </div>
            <div className="divide-y divide-border">
              {withIssues.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-ink-400">보고된 이슈가 없습니다.</div>
              ) : withIssues.map((r) => (
                <button key={r.id} onClick={() => setOpenId(r.id)} className="block w-full text-left px-4 py-2.5">
                  <div className="text-sm text-ink-900">{r.author} <span className="text-ink-400">· {r.team}</span></div>
                  <div className="text-[12px] text-ink-700 whitespace-pre-wrap">{r.issues}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 상세 모달 */}
      {opened && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-900/30 p-4" onClick={() => setOpenId("")}>
          <div className="panel panel-pad w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">{opened.author} <span className="text-sm text-ink-400">· {opened.team}</span></h3>
                <p className="text-xs text-ink-500">{weekLabel(opened.weekStart)} · 상태: {opened.status}</p>
              </div>
              <button className="text-ink-400 hover:text-ink-700" onClick={() => setOpenId("")}><X size={18} /></button>
            </div>
            <Field label="이번 주 한 일 / 활동" value={opened.thisWeek} />
            <Field label="다음 주 계획" value={opened.nextWeek} />
            <Field label="이슈 / 특이사항" value={opened.issues} />
            {opened.managerNote && <Field label="관리자 코멘트" value={opened.managerNote} />}
            <div className="mt-4 flex justify-end gap-2">
              <Link href={`/reports?id=${opened.id}`} className="btn-ghost">자세히/수정</Link>
              {opened.status !== "확인됨" && (
                <button className="btn-primary" onClick={() => { confirm(opened); setOpenId(""); }}>
                  <CheckCheck size={14} /> 확인 처리
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, tone = "default" }: {
  icon: React.ReactNode; label: string; value: string;
  tone?: "default" | "danger" | "warn";
}) {
  const toneCls = tone === "danger" ? "text-status-danger" : tone === "warn" ? "text-status-hold" : "text-ink-900";
  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center gap-1.5 text-ink-500 text-xs">{icon}{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-ink-700 mb-1">{label}</div>
      <div className="text-sm text-ink-800 whitespace-pre-wrap rounded-md border border-border bg-bg-subtle px-3 py-2 min-h-[2.2rem]">
        {value?.trim() ? value : <span className="text-ink-400">—</span>}
      </div>
    </div>
  );
}
