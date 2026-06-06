"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import type { Client, ClientStatus, Shipment } from "@/types";
import { formatCurrency, formatDateKst, formatNumber } from "@/lib/utils";

type EditableClient = Partial<Client> & { clientName: string };

const EMPTY_DRAFT: EditableClient = {
  clientCode: "", clientName: "", contactName: "", phone: "", email: "",
  country: "", region: "", address: "", note: "", status: "활성",
  unitPrice: 0, commissionRate: 0,
};

export default function ClientsClient({
  initialClients, shipments,
}: { initialClients: Client[]; shipments: Shipment[] }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  // Re-sync local state when server-fetched prop changes.
  useEffect(() => { setClients(initialClients); }, [initialClients]);

  const { save, saving, error, clearError, retry } = useResourceSave("/api/clients");

  // ─── Search ────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (!showInactive && c.status === "비활성") return false;
      if (!q) return true;
      return (
        c.clientName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.clientCode.toLowerCase().includes(q)
      );
    });
  }, [clients, query, showInactive]);

  // ─── 신규 등록 ──────────────────────────────────────────
  const [adding, setAdding] = useState<EditableClient | null>(null);
  async function submitAdd() {
    if (!adding || !adding.clientName.trim()) return;
    const res = await save<Client>("POST", { action: "create", data: adding });
    if (!res.ok) return;
    if (res.data) setClients((arr) => [...arr, res.data!]);
    setAdding(null);
    router.refresh();
  }

  // ─── 수정 ──────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditableClient>(EMPTY_DRAFT);
  function startEdit(c: Client) {
    setEditingId(c.id);
    setEditDraft({ ...c });
    setSelectedId(c.id);
  }
  function cancelEdit() { setEditingId(null); }
  async function submitEdit() {
    if (!editingId) return;
    const res = await save<Client>("POST", {
      action: "update", id: editingId, patch: editDraft,
    });
    if (!res.ok) return;
    if (res.data) {
      const u = res.data;
      setClients((arr) => arr.map((c) => (c.id === editingId ? u : c)));
    }
    setEditingId(null);
    router.refresh();
  }

  // ─── 활성/비활성 토글 ──────────────────────────────────
  async function toggleStatus(c: Client) {
    const action = c.status === "활성" ? "deactivate" : "activate";
    const res = await save<Client>("POST", { action, id: c.id });
    if (!res.ok) return;
    if (res.data) {
      const u = res.data;
      setClients((arr) => arr.map((x) => (x.id === c.id ? u : x)));
    }
    router.refresh();
  }

  // ─── 선택된 거래처 상세 + 출고 타임라인 ────────────────
  const [selectedId, setSelectedId] = useState<string>("");
  const selectedClient = clients.find((c) => c.id === selectedId);
  const clientShipments = useMemo(() => {
    if (!selectedClient) return [];
    return shipments
      .filter((s) =>
        (s.clientCode && s.clientCode === selectedClient.clientCode) ||
        (s.clientName && s.clientName === selectedClient.clientName) ||
        s.customer === selectedClient.clientName,
      )
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [shipments, selectedClient]);

  // 거래처별 집계 — shipment.unitPrice 우선, 없으면 현재 client 마스터값
  const agg = useMemo(() => {
    const count = clientShipments.length;
    const qty = clientShipments.reduce((s, x) => s + (x.qty || 0), 0);
    const last = clientShipments[0]?.date ?? "";
    const fallbackUnitPrice = selectedClient?.unitPrice ?? 0;
    const fallbackRate = selectedClient?.commissionRate ?? 0;
    let totalAmount = 0;
    let totalCommission = 0;
    for (const s of clientShipments) {
      const up = (s.unitPrice && s.unitPrice > 0) ? s.unitPrice : fallbackUnitPrice;
      const rate = (s.commissionRate && s.commissionRate > 0) ? s.commissionRate : fallbackRate;
      const amount = (s.qty || 0) * up;
      const commission = amount * (rate / 100);
      totalAmount += amount;
      totalCommission += commission;
    }
    const totalNet = totalAmount - totalCommission;
    const avgUnitPrice = qty > 0 ? totalAmount / qty : 0;
    return { count, qty, lastDate: last, totalAmount, totalCommission, totalNet, avgUnitPrice };
  }, [clientShipments, selectedClient]);

  return (
    <div>
      <PageHeader
        title="거래처관리"
        description="거래처를 등록 · 수정 · 비활성화. 출고 등록 시 여기 등록된 거래처를 선택해 사용합니다."
        actions={
          <button className="btn-primary" onClick={() => setAdding({ ...EMPTY_DRAFT })}>
            <Plus size={14} /> 거래처 등록
          </button>
        }
      />
      <SaveErrorPanel error={error} onClose={clearError} onRetry={() => retry()} retrying={saving} />

      {/* Search bar */}
      <div className="panel mb-4">
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label flex items-center gap-2"><Search size={12} /> 검색</label>
            <input className="input"
              placeholder="거래처명 · 담당자 · 국가 · 지역 · 연락처 · 거래처코드"
              value={query}
              onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="text-xs text-ink-600 flex items-center gap-1.5 pb-2">
            <input type="checkbox" checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)} />
            비활성 포함
          </label>
        </div>
      </div>

      {/* Add inline form */}
      {adding && (
        <div className="panel mb-4">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
            <Plus size={14} /> 거래처 등록
            <button className="ml-auto btn-ghost text-xs" onClick={() => setAdding(null)}>
              <X size={12} /> 취소
            </button>
          </div>
          <div className="px-4 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <Field label="거래처코드">
              <input className="input h-8" value={adding.clientCode ?? ""}
                onChange={(e) => setAdding({ ...adding, clientCode: e.target.value })} />
            </Field>
            <Field label="거래처명 *">
              <input className="input h-8" value={adding.clientName}
                onChange={(e) => setAdding({ ...adding, clientName: e.target.value })} />
            </Field>
            <Field label="담당자">
              <input className="input h-8" value={adding.contactName ?? ""}
                onChange={(e) => setAdding({ ...adding, contactName: e.target.value })} />
            </Field>
            <Field label="연락처">
              <input className="input h-8" value={adding.phone ?? ""}
                onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />
            </Field>
            <Field label="이메일">
              <input className="input h-8" value={adding.email ?? ""}
                onChange={(e) => setAdding({ ...adding, email: e.target.value })} />
            </Field>
            <Field label="국가">
              <input className="input h-8" value={adding.country ?? ""}
                onChange={(e) => setAdding({ ...adding, country: e.target.value })} />
            </Field>
            <Field label="지역">
              <input className="input h-8" value={adding.region ?? ""}
                onChange={(e) => setAdding({ ...adding, region: e.target.value })} />
            </Field>
            <Field label="상태">
              <select className="input h-8" value={adding.status ?? "활성"}
                onChange={(e) => setAdding({ ...adding, status: e.target.value as ClientStatus })}>
                <option value="활성">활성</option>
                <option value="비활성">비활성</option>
              </select>
            </Field>
            <Field label="기본 단가 (원)">
              <input className="input h-8 text-right tabular-nums" type="number" min={0}
                value={adding.unitPrice ?? 0}
                onChange={(e) => setAdding({ ...adding, unitPrice: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="수수료율 (%)">
              <input className="input h-8 text-right tabular-nums" type="number" min={0} max={100} step={0.1}
                value={adding.commissionRate ?? 0}
                onChange={(e) => setAdding({ ...adding, commissionRate: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="주소" className="col-span-2 lg:col-span-2">
              <input className="input h-8" value={adding.address ?? ""}
                onChange={(e) => setAdding({ ...adding, address: e.target.value })} />
            </Field>
            <Field label="비고" className="col-span-2">
              <input className="input h-8" value={adding.note ?? ""}
                onChange={(e) => setAdding({ ...adding, note: e.target.value })} />
            </Field>
          </div>
          <div className="px-4 py-3 border-t border-border flex justify-end">
            <button className="btn-primary text-xs"
              disabled={saving || !adding.clientName.trim()}
              onClick={submitAdd}>
              <Save size={12} /> 저장
            </button>
          </div>
        </div>
      )}

      {/* Clients table */}
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">
          거래처 목록 <span className="ml-2 text-[11px] font-normal text-ink-500">{filtered.length}개 표시</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>거래처코드</TH>
                <TH>거래처명</TH>
                <TH>담당자</TH>
                <TH>국가/지역</TH>
                <TH className="text-right">기본 단가</TH>
                <TH className="text-right">수수료율</TH>
                <TH>상태</TH>
                <TH className="text-right">관리</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 ? (
                <Empty>등록된 거래처 없음.</Empty>
              ) : filtered.map((c) => {
                const isEditing = editingId === c.id;
                if (isEditing) {
                  return (
                    <TR key={c.id}>
                      <TD><input className="input h-7 text-xs w-24 font-mono" value={editDraft.clientCode ?? ""}
                        onChange={(e) => setEditDraft({ ...editDraft, clientCode: e.target.value })} /></TD>
                      <TD><input className="input h-7 text-xs w-32" value={editDraft.clientName}
                        onChange={(e) => setEditDraft({ ...editDraft, clientName: e.target.value })} /></TD>
                      <TD><input className="input h-7 text-xs w-28" value={editDraft.contactName ?? ""}
                        onChange={(e) => setEditDraft({ ...editDraft, contactName: e.target.value })} /></TD>
                      <TD>
                        <input className="input h-7 text-xs w-16 inline-block" value={editDraft.country ?? ""}
                          onChange={(e) => setEditDraft({ ...editDraft, country: e.target.value })} />
                        <input className="input h-7 text-xs w-20 inline-block ml-1" value={editDraft.region ?? ""}
                          onChange={(e) => setEditDraft({ ...editDraft, region: e.target.value })} />
                      </TD>
                      <TD className="text-right">
                        <input className="input h-7 text-xs text-right tabular-nums w-24" type="number" min={0}
                          value={editDraft.unitPrice ?? 0}
                          onChange={(e) => setEditDraft({ ...editDraft, unitPrice: Number(e.target.value) || 0 })} />
                      </TD>
                      <TD className="text-right">
                        <input className="input h-7 text-xs text-right tabular-nums w-16" type="number" min={0} max={100} step={0.1}
                          value={editDraft.commissionRate ?? 0}
                          onChange={(e) => setEditDraft({ ...editDraft, commissionRate: Number(e.target.value) || 0 })} />
                      </TD>
                      <TD>
                        <select className="input h-7 text-xs" value={editDraft.status ?? "활성"}
                          onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value as ClientStatus })}>
                          <option value="활성">활성</option>
                          <option value="비활성">비활성</option>
                        </select>
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <button className="btn-primary text-xs" disabled={saving} onClick={submitEdit}>
                          <Save size={12} /> 저장
                        </button>
                        <button className="btn-ghost text-xs ml-1" onClick={cancelEdit}>
                          <X size={12} />
                        </button>
                      </TD>
                    </TR>
                  );
                }
                return (
                  <TR key={c.id} highlight={selectedId === c.id}>
                    <TD className="font-mono text-xs">{c.clientCode || <span className="text-ink-400">—</span>}</TD>
                    <TD className="font-medium text-ink-900">
                      <button type="button"
                        className="hover:underline text-left"
                        onClick={() => setSelectedId(c.id)}>
                        {c.clientName}
                      </button>
                    </TD>
                    <TD>
                      {c.contactName || <span className="text-ink-400">—</span>}
                      {c.phone && <div className="text-[10px] text-ink-500 font-mono">{c.phone}</div>}
                    </TD>
                    <TD>
                      {[c.country, c.region].filter(Boolean).join(" / ") || <span className="text-ink-400">—</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{c.unitPrice > 0 ? formatCurrency(c.unitPrice) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums">{c.commissionRate > 0 ? `${c.commissionRate}%` : <span className="text-ink-400">—</span>}</TD>
                    <TD>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        c.status === "활성"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : "bg-bg-subtle text-ink-500 border-border"
                      }`}>{c.status}</span>
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <button className="btn-ghost text-xs" onClick={() => setSelectedId(c.id)}>상세</button>
                      <button className="btn-ghost text-xs ml-1" onClick={() => startEdit(c)}>수정</button>
                      <button className="btn-ghost text-xs ml-1" onClick={() => toggleStatus(c)}>
                        {c.status === "활성" ? "비활성화" : "활성화"}
                      </button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </div>

      {/* Selected client detail + shipment timeline */}
      {selectedClient && (
        <div className="panel mb-4">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold flex items-center gap-2">
            거래처 상세 — {selectedClient.clientName}
            <span className="ml-2 text-[11px] font-normal text-ink-500">
              {selectedClient.clientCode && `[${selectedClient.clientCode}]`} · {selectedClient.status}
            </span>
            <button className="ml-auto btn-ghost text-xs" onClick={() => setSelectedId("")}>
              <X size={12} /> 닫기
            </button>
          </div>

          {/* Basic info */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs border-b border-border">
            <Field label="담당자"><div className="px-1">{selectedClient.contactName || "—"}</div></Field>
            <Field label="연락처"><div className="px-1 font-mono">{selectedClient.phone || "—"}</div></Field>
            <Field label="이메일"><div className="px-1 break-all">{selectedClient.email || "—"}</div></Field>
            <Field label="국가 / 지역"><div className="px-1">{[selectedClient.country, selectedClient.region].filter(Boolean).join(" / ") || "—"}</div></Field>
            <Field label="주소" className="col-span-2"><div className="px-1">{selectedClient.address || "—"}</div></Field>
            <Field label="비고" className="col-span-2"><div className="px-1 text-ink-600">{selectedClient.note || "—"}</div></Field>
          </div>

          {/* Aggregation */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-border bg-bg-subtle/30 text-xs">
            <Stat label="총 출고 건수" value={`${agg.count}건`} />
            <Stat label="총 출고 수량" value={`${formatNumber(agg.qty)}세트`} />
            <Stat label="최근 출고일" value={agg.lastDate ? formatDateKst(agg.lastDate) : "—"} />
            <Stat label="기본 단가 / 수수료율" value={
              <>
                {selectedClient.unitPrice > 0 ? formatCurrency(selectedClient.unitPrice) : "—"}
                {" / "}
                {selectedClient.commissionRate > 0 ? `${selectedClient.commissionRate}%` : "—"}
              </>
            } />
            <Stat label="총 출고금액" value={agg.totalAmount > 0 ? formatCurrency(agg.totalAmount) : "—"} />
            <Stat label="총 수수료" value={agg.totalCommission > 0 ? formatCurrency(agg.totalCommission) : "—"} />
            <Stat label="총 실입금액" value={agg.totalNet > 0 ? formatCurrency(agg.totalNet) : "—"} />
            <Stat label="평균 단가" value={agg.avgUnitPrice > 0 ? formatCurrency(agg.avgUnitPrice) : "—"} />
          </div>

          {/* Shipment timeline */}
          <div className="px-4 py-3 text-sm font-semibold border-b border-border">출고 타임라인</div>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>출고일</TH>
                  <TH>옵션코드</TH>
                  <TH>제품명</TH>
                  <TH className="text-right">수량</TH>
                  <TH className="text-right">단가</TH>
                  <TH className="text-right">출고금액</TH>
                  <TH className="text-right">수수료</TH>
                  <TH className="text-right">실입금액</TH>
                  <TH>메모</TH>
                </TR>
              </THead>
              <TBody>
                {clientShipments.length === 0 ? (
                  <Empty>이 거래처로의 출고 기록이 없습니다.</Empty>
                ) : clientShipments.map((s) => {
                  const fallbackUnit = selectedClient.unitPrice ?? 0;
                  const fallbackRate = selectedClient.commissionRate ?? 0;
                  const up = (s.unitPrice && s.unitPrice > 0) ? s.unitPrice : fallbackUnit;
                  const rate = (s.commissionRate && s.commissionRate > 0) ? s.commissionRate : fallbackRate;
                  const amount = (s.qty || 0) * up;
                  const commission = amount * (rate / 100);
                  const net = amount - commission;
                  return (
                    <TR key={s.id}>
                      <TD className="font-mono text-xs">{formatDateKst(s.date)}</TD>
                      <TD className="font-mono text-xs">{s.optionCode}</TD>
                      <TD>{s.productType} {s.setSize} {s.optionName}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(s.qty)}</TD>
                      <TD className="text-right tabular-nums">{up > 0 ? formatCurrency(up) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums font-medium">{amount > 0 ? formatCurrency(amount) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums text-red-600">{commission > 0 ? `−${formatCurrency(commission)}` : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums font-semibold text-emerald-700">{net > 0 ? formatCurrency(net) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-ink-600 max-w-[200px] truncate">{s.note}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
            출고 매칭: <code>clientCode</code> 우선 → <code>clientName</code> → 기존 <code>customer</code> 컬럼 fallback.
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, children, className = "",
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1">{label}</div>
      {children}
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-ink-900 tabular-nums">{value}</div>
    </div>
  );
}
