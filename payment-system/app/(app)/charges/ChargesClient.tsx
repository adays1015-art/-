"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wallet, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/Table";
import type { Charge, ChargeStatus, PayClient, PaymentMethod } from "@/types";
import { CHARGE_STATUSES, PAYMENT_METHODS } from "@/types";
import { balanceOf, paidTotal, statusOf, STATUS_TONE } from "@/lib/charge";
import { formatWon, todayISO } from "@/lib/utils";

function StatusBadge({ s }: { s: ChargeStatus }) {
  return <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${STATUS_TONE[s]}`}>{s}</span>;
}

type ChargeDraft = { clientName: string; chargeDate: string; title: string; amount: number; dueDate: string; note: string };
function emptyCharge(): ChargeDraft {
  return { clientName: "", chargeDate: todayISO(), title: "", amount: 0, dueDate: "", note: "" };
}

export default function ChargesClient({
  initial, clients, today,
}: { initial: Charge[]; clients: PayClient[]; today: string }) {
  const router = useRouter();
  const [charges, setCharges] = useState(initial);
  const [filter, setFilter] = useState<ChargeStatus | "전체">("전체");
  const [query, setQuery] = useState("");

  // 신규 청구 모달
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<ChargeDraft>(emptyCharge());
  const [busy, setBusy] = useState(false);

  // 상세(수금) 모달
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = charges.find((c) => c.id === detailId) ?? null;
  const [pay, setPay] = useState<{ date: string; amount: number; method: PaymentMethod; memo: string }>(
    { date: today, amount: 0, method: "계좌이체", memo: "" });

  const withStatus = useMemo(
    () => charges.map((c) => ({ c, status: statusOf(c, today), balance: balanceOf(c), paid: paidTotal(c) })),
    [charges, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStatus.filter(({ c, status }) => {
      if (filter !== "전체" && status !== filter) return false;
      if (!q) return true;
      return c.clientName.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
    });
  }, [withStatus, filter, query]);

  const sum = useMemo(() => {
    const charged = filtered.reduce((s, x) => s + (x.c.amount || 0), 0);
    const paid = filtered.reduce((s, x) => s + x.paid, 0);
    const balance = filtered.reduce((s, x) => s + x.balance, 0);
    return { charged, paid, balance };
  }, [filtered]);

  const countByStatus = useMemo(() => {
    const m: Record<string, number> = { 전체: withStatus.length };
    for (const s of CHARGE_STATUSES) m[s] = withStatus.filter((x) => x.status === s).length;
    return m;
  }, [withStatus]);

  async function post(body: unknown) {
    const res = await fetch("/api/charges", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error ?? "처리 실패"); return null; }
    return json.data as Charge;
  }

  async function submitAdd() {
    if (!draft.clientName.trim()) { alert("거래처명을 입력하세요."); return; }
    if (!(draft.amount > 0)) { alert("청구금액을 입력하세요."); return; }
    setBusy(true);
    try {
      const d = await post({ action: "create", data: draft });
      if (!d) return;
      setCharges((arr) => [d, ...arr]);
      setAddOpen(false); setDraft(emptyCharge());
      router.refresh();
    } finally { setBusy(false); }
  }

  async function removeCharge(c: Charge) {
    if (!confirm(`${c.clientName} · ${c.title || "청구"} 건을 삭제할까요?`)) return;
    const res = await fetch("/api/charges", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: c.id }),
    });
    if (res.ok) { setCharges((arr) => arr.filter((x) => x.id !== c.id)); router.refresh(); }
  }

  function openDetail(id: string) {
    setDetailId(id);
    setPay({ date: today, amount: 0, method: "계좌이체", memo: "" });
  }

  async function addPay() {
    if (!detail) return;
    if (!(pay.amount > 0)) { alert("수금액을 입력하세요."); return; }
    const d = await post({ action: "addPayment", id: detail.id, payment: pay });
    if (!d) return;
    setCharges((arr) => arr.map((c) => (c.id === d.id ? d : c)));
    setPay({ date: today, amount: 0, method: "계좌이체", memo: "" });
    router.refresh();
  }

  async function delPay(paymentId: string) {
    if (!detail) return;
    const d = await post({ action: "deletePayment", id: detail.id, paymentId });
    if (!d) return;
    setCharges((arr) => arr.map((c) => (c.id === d.id ? d : c)));
    router.refresh();
  }

  const TABS: (ChargeStatus | "전체")[] = ["전체", ...CHARGE_STATUSES];
  const iconBtn = "p-1.5 rounded-md hover:bg-bg-subtle text-ink-600 transition-colors";

  return (
    <div>
      <PageHeader
        title="청구·수금"
        description="청구 건별 수금 기록과 미수금 관리"
        actions={<button className="btn-primary" onClick={() => { setDraft(emptyCharge()); setAddOpen(true); }}>
          <Plus size={16} /> 청구 등록</button>}
      />

      {/* 상태 필터 + 검색 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-panel p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === t ? "bg-beige-100 text-ink-900 font-medium" : "text-ink-600 hover:bg-bg-subtle"}`}>
              {t} <span className="text-ink-400">{countByStatus[t] ?? 0}</span>
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="거래처·내용 검색"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* 합계 바 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="panel px-4 py-3"><div className="text-xs text-ink-500">청구 합계</div>
          <div className="text-lg font-semibold tabular-nums">{formatWon(sum.charged)}</div></div>
        <div className="panel px-4 py-3"><div className="text-xs text-ink-500">수금 합계</div>
          <div className="text-lg font-semibold tabular-nums text-emerald-600">{formatWon(sum.paid)}</div></div>
        <div className="panel px-4 py-3"><div className="text-xs text-ink-500">미수금 합계</div>
          <div className="text-lg font-semibold tabular-nums text-red-600">{formatWon(sum.balance)}</div></div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>청구일</TH><TH>거래처</TH><TH>내용</TH>
            <TH className="text-right">청구금액</TH><TH className="text-right">수금액</TH><TH className="text-right">미수금</TH>
            <TH>수금예정</TH><TH>상태</TH><TH className="text-right">관리</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? (
            <TR><TD>해당 조건의 청구가 없습니다.</TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>
          ) : filtered.map(({ c, status, balance, paid }) => (
            <TR key={c.id} onClick={() => openDetail(c.id)}>
              <TD className="tabular-nums whitespace-nowrap">{c.chargeDate}</TD>
              <TD className="font-medium text-ink-900">{c.clientName}</TD>
              <TD className="text-ink-600">{c.title || "—"}</TD>
              <TD className="text-right tabular-nums">{formatWon(c.amount)}</TD>
              <TD className="text-right tabular-nums text-emerald-600">{paid ? formatWon(paid) : "—"}</TD>
              <TD className="text-right tabular-nums font-medium text-red-600">{balance ? formatWon(balance) : "—"}</TD>
              <TD className={`tabular-nums whitespace-nowrap ${status === "연체" ? "text-red-600" : "text-ink-500"}`}>{c.dueDate || "—"}</TD>
              <TD><StatusBadge s={status} /></TD>
              <TD>
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => openDetail(c.id)}>
                    <Wallet size={13} /> 수금</button>
                  <button className={`${iconBtn} text-red-600`} title="삭제" onClick={() => removeCharge(c)}><Trash2 size={15} /></button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {/* 청구 등록 모달 */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="청구 등록"
        footer={<>
          <button className="btn-ghost" onClick={() => setAddOpen(false)}>취소</button>
          <button className="btn-primary" disabled={busy} onClick={submitAdd}>{busy ? "저장 중…" : "저장"}</button>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">거래처 *</label>
              <input className="input" list="pay-client-list" value={draft.clientName}
                onChange={(e) => setDraft({ ...draft, clientName: e.target.value })} placeholder="거래처명" autoFocus />
              <datalist id="pay-client-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div><label className="label">청구일</label>
              <input type="date" className="input" value={draft.chargeDate}
                onChange={(e) => setDraft({ ...draft, chargeDate: e.target.value })} /></div>
          </div>
          <div><label className="label">내용 / 품목</label>
            <input className="input" value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 오일파스텔 24색 100개" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">청구금액 *</label>
              <input type="number" className="input text-right" value={draft.amount || ""}
                onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} /></div>
            <div><label className="label">수금예정일</label>
              <input type="date" className="input" value={draft.dueDate}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></div>
          </div>
          <div><label className="label">비고</label>
            <input className="input" value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
        </div>
      </Modal>

      {/* 상세 + 수금 모달 */}
      <Modal open={!!detail} onClose={() => setDetailId(null)}
        title={detail ? `${detail.clientName} · 수금 관리` : ""} width="max-w-2xl"
        footer={<button className="btn-ghost" onClick={() => setDetailId(null)}>닫기</button>}>
        {detail && (() => {
          const paid = paidTotal(detail); const balance = balanceOf(detail);
          const status = statusOf(detail, today);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="panel px-3 py-2"><div className="text-xs text-ink-500">청구금액</div>
                  <div className="font-semibold tabular-nums">{formatWon(detail.amount)}</div></div>
                <div className="panel px-3 py-2"><div className="text-xs text-ink-500">수금</div>
                  <div className="font-semibold tabular-nums text-emerald-600">{formatWon(paid)}</div></div>
                <div className="panel px-3 py-2"><div className="text-xs text-ink-500">미수금</div>
                  <div className="font-semibold tabular-nums text-red-600">{formatWon(balance)}</div></div>
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-600">
                <StatusBadge s={status} />
                <span>{detail.title}</span>
                <span className="text-ink-400">· 청구일 {detail.chargeDate}{detail.dueDate ? ` · 예정 ${detail.dueDate}` : ""}</span>
              </div>

              {/* 수금 내역 */}
              <div>
                <div className="label">수금 내역</div>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {(detail.payments ?? []).length === 0 ? (
                    <div className="px-3 py-3 text-sm text-ink-500">아직 수금 내역이 없습니다.</div>
                  ) : detail.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="tabular-nums text-ink-600 w-24">{p.date}</span>
                      <span className="text-ink-500 w-16">{p.method}</span>
                      <span className="tabular-nums font-medium text-emerald-600 flex-1 text-right">{formatWon(p.amount)}</span>
                      <span className="text-ink-400 flex-1 truncate">{p.memo}</span>
                      <button className="text-red-500 hover:text-red-700" onClick={() => delPay(p.id)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 수금 추가 */}
              <div className="bg-bg-subtle/60 rounded-lg border border-border p-3">
                <div className="label">수금 입력</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div><label className="label">입금일</label>
                    <input type="date" className="input" value={pay.date}
                      onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
                  <div><label className="label">수금액</label>
                    <input type="number" className="input text-right" value={pay.amount || ""}
                      onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} /></div>
                  <div><label className="label">방법</label>
                    <select className="input" value={pay.method}
                      onChange={(e) => setPay({ ...pay, method: e.target.value as PaymentMethod })}>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select></div>
                  <button className="btn-primary justify-center" onClick={addPay}>수금 추가</button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="input" placeholder="메모 (선택)" value={pay.memo}
                    onChange={(e) => setPay({ ...pay, memo: e.target.value })} />
                  {balance > 0 && (
                    <button className="btn-ghost whitespace-nowrap"
                      onClick={() => setPay({ ...pay, amount: balance })}>잔액 전액 ({formatWon(balance)})</button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
