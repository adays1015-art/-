"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X, Search, AlertCircle, Receipt, Check, Ban } from "lucide-react";
import type { ExpenseRequest, ExpenseStatus, Session } from "@/lib/types";
import { todayISO } from "@/lib/week";

function statusBadge(s: ExpenseStatus): string {
  switch (s) {
    case "승인": return "bg-status-progress/10 text-status-progress";
    case "완료": return "bg-status-done/15 text-status-done";
    case "반려": return "bg-status-danger/10 text-status-danger";
    default: return "bg-beige-200 text-ink-900"; // 요청
  }
}
function won(n: number): string { return n ? n.toLocaleString("ko-KR") + "원" : "—"; }

type Draft = { date: string; item: string; qty: string; amount: string; vendor: string; reason: string };
function emptyDraft(): Draft {
  return { date: todayISO(), item: "", qty: "", amount: "", vendor: "", reason: "" };
}

export default function ExpenseClient({
  initialExpenses, session,
}: { initialExpenses: ExpenseRequest[]; session: Session }) {
  const router = useRouter();
  const isManager = session.role === "관리자";
  const [rows, setRows] = useState<ExpenseRequest[]>(initialExpenses);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [openId, setOpenId] = useState<string>("");
  const [note, setNote] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const mine = isManager ? rows : rows.filter((r) => r.requester === session.name && r.team === session.team);
    return mine.filter((r) => !q ||
      r.item.toLowerCase().includes(q) || r.requester.toLowerCase().includes(q) ||
      r.team.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q));
  }, [rows, query, isManager, session]);

  const opened = rows.find((r) => r.id === openId) ?? null;

  async function post(body: unknown): Promise<ExpenseRequest | null> {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "오류가 발생했습니다."); return null; }
      return (json.data as ExpenseRequest) ?? null;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!draft.item.trim()) { setError("품목/자재명을 입력하세요."); return; }
    const c = await post({ action: "create", data: { ...draft, amount: Number(draft.amount) || 0 } });
    if (!c) return;
    setRows((arr) => [c, ...arr]); setFormOpen(false); setDraft(emptyDraft());
    router.refresh();
  }
  async function decide(r: ExpenseRequest, status: ExpenseStatus) {
    const u = await post({ action: "decide", id: r.id, patch: { status, managerNote: note } });
    if (!u) return;
    setRows((arr) => arr.map((x) => (x.id === r.id ? u : x)));
    setNote(""); setOpenId("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">지출결의서</h1>
          <p className="text-sm text-ink-600 mt-1">필요 물품·자재 구매 요청을 올리고 결재 받습니다.</p>
        </div>
        <button className="btn-primary" onClick={() => { setDraft(emptyDraft()); setFormOpen(true); }}>
          <Plus size={14} /> 지출 요청
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/5 px-4 py-3 text-sm text-ink-800">
          <AlertCircle size={16} className="text-status-danger mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-ink-400 hover:text-ink-700"><X size={14} /></button>
        </div>
      )}

      {formOpen && (
        <div className="panel panel-pad mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink-900">새 지출 요청</h2>
            <button className="btn-ghost" onClick={() => setFormOpen(false)}><X size={14} /> 닫기</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <div><label className="label">신청일</label>
              <input type="date" className="input" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="label">품목 / 자재명 *</label>
              <input className="input" placeholder="예: 안료 5kg, A4용지" value={draft.item} onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value }))} /></div>
            <div><label className="label">수량</label>
              <input className="input" placeholder="예: 10개, 2박스" value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))} /></div>
            <div><label className="label">예상 금액(원)</label>
              <input className="input" inputMode="numeric" placeholder="0" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value.replace(/[^\d]/g, "") }))} /></div>
            <div><label className="label">구매처(선택)</label>
              <input className="input" placeholder="거래처/쇼핑몰" value={draft.vendor} onChange={(e) => setDraft((d) => ({ ...d, vendor: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="label">사유 / 용도</label>
              <input className="input" placeholder="왜 필요한지" value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} /></div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={() => setFormOpen(false)}>취소</button>
            <button className="btn-primary" onClick={submit} disabled={busy || !draft.item.trim()}><Save size={14} /> {busy ? "올리는 중…" : "요청 올리기"}</button>
          </div>
        </div>
      )}

      <div className="panel mb-3 px-4 py-3">
        <label className="label flex items-center gap-2"><Search size={12} /> 검색</label>
        <input className="input" placeholder="품목 · 신청자 · 팀 · 구매처" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full border-collapse">
          <thead><tr>
            <th className="table-th">신청일</th><th className="table-th">품목</th>
            <th className="table-th">수량</th><th className="table-th text-right">예상금액</th>
            <th className="table-th">신청자</th><th className="table-th">상태</th>
          </tr></thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td className="table-td text-center text-ink-400 py-10" colSpan={6}>
                <Receipt size={20} className="mx-auto mb-2 text-ink-300" />올라온 지출 요청이 없습니다.
              </td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-bg-subtle">
                <td className="table-td">{r.date}</td>
                <td className="table-td font-medium text-ink-900">{r.item}</td>
                <td className="table-td">{r.qty || "—"}</td>
                <td className="table-td text-right">{won(r.amount)}</td>
                <td className="table-td">{r.requester}<span className="text-ink-400"> · {r.team}</span></td>
                <td className="table-td"><span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${statusBadge(r.status)}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {opened && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink-900/30 p-4" onClick={() => setOpenId("")}>
          <div className="panel panel-pad w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">{opened.item}</h3>
                <p className="text-xs text-ink-500">{opened.date} · {opened.requester} · {opened.team}</p>
              </div>
              <button className="text-ink-400 hover:text-ink-700" onClick={() => setOpenId("")}><X size={18} /></button>
            </div>
            <dl className="text-sm space-y-1.5 mb-3">
              <Row k="수량" v={opened.qty || "—"} />
              <Row k="예상 금액" v={won(opened.amount)} />
              <Row k="구매처" v={opened.vendor || "—"} />
              <Row k="사유/용도" v={opened.reason || "—"} />
              <Row k="상태" v={opened.status} />
              {opened.managerNote && <Row k="결재 의견" v={opened.managerNote} />}
            </dl>
            {isManager && opened.status === "요청" && (
              <div className="rounded-md border border-border bg-bg-subtle p-3">
                <label className="label">결재 의견 (선택)</label>
                <input className="input mb-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="승인/반려 사유" />
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost" onClick={() => decide(opened, "반려")}><Ban size={14} /> 반려</button>
                  <button className="btn-primary" onClick={() => decide(opened, "승인")}><Check size={14} /> 승인</button>
                </div>
              </div>
            )}
            {isManager && opened.status === "승인" && (
              <div className="flex justify-end">
                <button className="btn-primary" onClick={() => decide(opened, "완료")}><Check size={14} /> 구매완료 처리</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-ink-500">{k}</dt>
      <dd className="text-ink-900 whitespace-pre-wrap">{v}</dd>
    </div>
  );
}
