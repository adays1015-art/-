"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Charge, PayClient } from "@/types";
import { balanceOf } from "@/lib/charge";
import { formatWon } from "@/lib/utils";

type Draft = { name: string; contact: string; phone: string; note: string };
const EMPTY: Draft = { name: "", contact: "", phone: "", note: "" };

export default function ClientsClient({
  initial, charges,
}: { initial: PayClient[]; charges: Charge[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initial);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  // 거래처별 미수금 합계
  const balByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of charges) m.set(c.clientName, (m.get(c.clientName) ?? 0) + balanceOf(c));
    return m;
  }, [charges]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.phone.includes(q));
  }, [clients, query]);

  function openNew() { setEditId(null); setDraft(EMPTY); setOpen(true); }
  function openEdit(c: PayClient) {
    setEditId(c.id);
    setDraft({ name: c.name, contact: c.contact, phone: c.phone, note: c.note });
    setOpen(true);
  }

  async function save() {
    if (!draft.name.trim()) { alert("거래처명을 입력하세요."); return; }
    setBusy(true);
    try {
      const body = editId
        ? { action: "update", id: editId, patch: draft }
        : { action: "create", data: draft };
      const res = await fetch("/api/clients", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "저장 실패"); return; }
      const d = json.data as PayClient;
      setClients((arr) => editId ? arr.map((c) => (c.id === editId ? d : c)) : [...arr, d]);
      setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove(c: PayClient) {
    if (!confirm(`'${c.name}' 거래처를 삭제할까요?`)) return;
    const res = await fetch("/api/clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: c.id }),
    });
    if (res.ok) { setClients((arr) => arr.filter((x) => x.id !== c.id)); router.refresh(); }
  }

  const iconBtn = "p-1.5 rounded-md hover:bg-bg-subtle text-ink-600 transition-colors";

  return (
    <div>
      <PageHeader
        title="거래처"
        description="청구·수금 대상 거래처 관리"
        actions={<button className="btn-primary" onClick={openNew}><Plus size={16} /> 거래처 추가</button>}
      />

      <div className="relative max-w-xs mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className="input pl-8" placeholder="거래처·담당자·연락처 검색"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <Table>
        <THead>
          <TR>
            <TH>거래처명</TH><TH>담당자</TH><TH>연락처</TH>
            <TH className="text-right">미수금</TH><TH>비고</TH><TH className="text-right">관리</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? (
            <TR><TD>거래처가 없습니다.</TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>
          ) : filtered.map((c) => {
            const bal = balByName.get(c.name) ?? 0;
            return (
              <TR key={c.id}>
                <TD className="font-medium text-ink-900">{c.name}</TD>
                <TD>{c.contact || "—"}</TD>
                <TD className="tabular-nums">{c.phone || "—"}</TD>
                <TD className={`text-right tabular-nums ${bal > 0 ? "text-red-600 font-medium" : "text-ink-400"}`}>
                  {bal > 0 ? formatWon(bal) : "—"}
                </TD>
                <TD className="text-ink-500">{c.note || "—"}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <button className={iconBtn} title="수정" onClick={() => openEdit(c)}><Pencil size={15} /></button>
                    <button className={`${iconBtn} text-red-600`} title="삭제" onClick={() => remove(c)}><Trash2 size={15} /></button>
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId ? "거래처 수정" : "거래처 추가"}
        footer={<>
          <button className="btn-ghost" onClick={() => setOpen(false)}>취소</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </>}
      >
        <div className="space-y-3">
          <div><label className="label">거래처명 *</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">담당자</label>
              <input className="input" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></div>
            <div><label className="label">연락처</label>
              <input className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
          </div>
          <div><label className="label">비고</label>
            <input className="input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
