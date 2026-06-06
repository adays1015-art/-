"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Client, FinishedSet, Shipment } from "@/types";
import { formatDate, formatNumber, todayISO } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import { useRouter } from "next/navigation";

type EditableShipment = Omit<Shipment, "id">;

function emptyShipment(): EditableShipment {
  return {
    date: todayISO(), productType: "오일파스텔", setSize: "10색",
    optionName: "", optionCode: "", qty: 1,
    customer: "", assignee: "", note: "",
    clientCode: "", clientName: "", contactName: "", country: "", region: "",
    unitPrice: 0, commissionRate: 0,
  };
}

export default function ShipmentsClient({
  initial, finished, clients = [],
}: { initial: Shipment[]; finished: FinishedSet[]; clients?: Client[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Shipment[]>(initial);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const visibleItems = items.slice(0, visibleCount);
  const canEditShip = useCanEdit("shipment");
  const [editing, setEditing] = useState<EditableShipment | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/shipments");

  const selectedStock = useMemo(() => {
    if (!editing?.optionCode) return null;
    return finished.find((f) => f.optionCode === editing.optionCode) ?? null;
  }, [editing, finished]);

  async function onSave() {
    if (!editing) return;
    setWarning(null);
    const res = await save<Shipment>("POST", editing);
    if (!res.ok) return;
    try {
      const fresh = await (await fetch("/api/shipments")).json();
      if (Array.isArray(fresh.data)) setItems(fresh.data);
    } catch { /* keep stale */ }
    router.refresh();
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="출고 관리"
        description="완제품 세트 단위로 출고를 등록합니다. 출고 시 완제품 세트 재고만 차감되며, 원료나 품목 재고는 영향받지 않습니다."
        actions={
          <button className="btn-primary" onClick={() => { setEditing(emptyShipment()); setWarning(null); }}
            disabled={!canEditShip} title={!canEditShip ? PERMISSION_TIP : undefined}
          ><Plus size={14} /> 출고 등록</button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>출고일</TH><TH>제품유형</TH><TH>세트유형</TH><TH>옵션명</TH><TH>옵션코드</TH>
            <TH className="text-right">출고 수량</TH><TH>거래처</TH><TH>담당자</TH><TH>메모</TH>
          </TR>
        </THead>
        <TBody>
          {items.length === 0 ? <Empty>출고 기록이 없습니다.</Empty> :
            visibleItems.map((s) => (
              <TR key={s.id}>
                <TD>{formatDate(s.date)}</TD>
                <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{s.productType}</span></TD>
                <TD>{s.setSize}</TD>
                <TD className="font-medium text-ink-900">{s.optionName}</TD>
                <TD className="font-mono text-xs">{s.optionCode}</TD>
                <TD className="text-right tabular-nums font-semibold text-red-600">-{formatNumber(s.qty)}</TD>
                <TD>
                  {s.clientName || s.customer || <span className="text-ink-400">—</span>}
                  {s.contactName && <div className="text-[10px] text-ink-500">{s.contactName}{s.country ? ` · ${s.country}` : ""}{s.region ? ` ${s.region}` : ""}</div>}
                </TD>
                <TD>{s.assignee}</TD>
                <TD className="text-ink-600 max-w-[240px] truncate">{s.note}</TD>
              </TR>
            ))
          }
        </TBody>
      </Table>

      {items.length > visibleCount && (
        <div className="mt-3 text-center">
          <button className="btn-ghost text-xs"
            onClick={() => setVisibleCount((n) => n + 50)}>
            더 보기 ({visibleCount} / {items.length})
          </button>
        </div>
      )}
      {items.length > 50 && items.length <= visibleCount && (
        <div className="mt-3 text-center text-[11px] text-ink-500">
          전체 {items.length}건 표시 중
        </div>
      )}

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title="출고 등록"
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEditShip}
            title={!canEditShip ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">출고일</label>
                <input className="input" type="date" value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></div>
              <div><label className="label">담당자</label>
                <input className="input" value={editing.assignee}
                  onChange={(e) => setEditing({ ...editing, assignee: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">완제품 옵션</label>
                <select className="input"
                  value={editing.optionCode}
                  onChange={(e) => {
                    const f = finished.find((x) => x.optionCode === e.target.value);
                    if (!f) {
                      setEditing({ ...editing, optionCode: e.target.value });
                      return;
                    }
                    setEditing({
                      ...editing,
                      optionCode: f.optionCode,
                      optionName: f.optionName,
                      productType: f.productType,
                      setSize: f.setSize,
                    });
                  }}>
                  <option value="">선택...</option>
                  {finished.map((f) => (
                    <option key={f.id} value={f.optionCode}>
                      [{f.productType}] {f.setSize} · {f.optionName} ({f.optionCode}) — 가용 {f.available}
                    </option>
                  ))}
                </select>
              </div>
              <div><label className="label">출고 수량</label>
                <input className="input" type="number" value={editing.qty}
                  onChange={(e) => setEditing({ ...editing, qty: Number(e.target.value) })} /></div>
              <div className="col-span-2"><label className="label">거래처</label>
                {clients.filter((c) => c.status === "활성").length > 0 ? (
                  <select className="input"
                    value={editing.clientCode || ""}
                    onChange={(e) => {
                      const code = e.target.value;
                      const c = clients.find((x) => x.clientCode === code);
                      if (!c) {
                        setEditing({
                          ...editing,
                          clientCode: code, clientName: "", contactName: "",
                          country: "", region: "", customer: "",
                        });
                        return;
                      }
                      setEditing({
                        ...editing,
                        clientCode: c.clientCode,
                        clientName: c.clientName,
                        contactName: c.contactName,
                        country: c.country,
                        region: c.region,
                        customer: c.clientName, // 옛 컬럼 호환
                        unitPrice: c.unitPrice || 0,
                        commissionRate: c.commissionRate || 0,
                      });
                    }}>
                    <option value="">거래처 선택…</option>
                    {clients
                      .filter((c) => c.status === "활성")
                      .sort((a, b) => a.clientName.localeCompare(b.clientName))
                      .map((c) => (
                        <option key={c.id} value={c.clientCode}>
                          {c.clientName}
                          {c.contactName ? ` · ${c.contactName}` : ""}
                          {c.country ? ` · ${c.country}` : ""}
                          {c.region ? ` ${c.region}` : ""}
                        </option>
                      ))}
                  </select>
                ) : (
                  <>
                    <input className="input" value={editing.customer}
                      placeholder="거래처마스터 미등록 — 직접 입력 (fallback)"
                      onChange={(e) => setEditing({ ...editing, customer: e.target.value, clientName: e.target.value })} />
                    <div className="text-[11px] text-ink-500 mt-1">
                      등록된 거래처 없음. <a href="/clients" className="underline">거래처관리</a>에서 등록 후 picker 로 선택 가능.
                    </div>
                  </>
                )}
                {editing.clientCode && (
                  <div className="text-[11px] text-ink-500 mt-1">
                    선택됨: <b>{editing.clientName}</b>
                    {editing.contactName && <> · 담당 {editing.contactName}</>}
                    {editing.country && <> · {editing.country}</>}
                    {editing.region && <> {editing.region}</>}
                  </div>
                )}
              </div>
              <div><label className="label">단가 (원)</label>
                <input className="input text-right tabular-nums" type="number" min={0}
                  value={editing.unitPrice ?? 0}
                  onChange={(e) => setEditing({ ...editing, unitPrice: Number(e.target.value) || 0 })} /></div>
              <div><label className="label">수수료율 (%)</label>
                <input className="input text-right tabular-nums" type="number" min={0} max={100} step={0.1}
                  value={editing.commissionRate ?? 0}
                  onChange={(e) => setEditing({ ...editing, commissionRate: Number(e.target.value) || 0 })} /></div>
              <div className="col-span-2"><label className="label">메모</label>
                <textarea className="input min-h-[60px]" value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
            </div>

            {/* 출고금액 · 수수료 · 실입금액 자동 계산 */}
            {(() => {
              const qty = editing.qty || 0;
              const up = editing.unitPrice ?? 0;
              const rate = editing.commissionRate ?? 0;
              const amount = qty * up;
              const commission = amount * (rate / 100);
              const net = amount - commission;
              if (amount === 0) return null;
              return (
                <div className="panel panel-pad bg-bg-subtle/30 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">출고금액</div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatNumber(amount)}원</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">수수료 ({rate}%)</div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums text-red-600">−{formatNumber(commission)}원</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">실입금액</div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-700">{formatNumber(net)}원</div>
                  </div>
                </div>
              );
            })()}

            {selectedStock && (
              <div className="panel panel-pad text-sm text-ink-700">
                선택된 완제품 재고 — 총 <b>{formatNumber(selectedStock.stock)}</b>세트,
                예약 출고 {formatNumber(selectedStock.reserved)} → 가용{" "}
                <b className={selectedStock.available < editing.qty ? "text-red-700" : "text-emerald-700"}>
                  {formatNumber(selectedStock.available)}
                </b>세트
                {selectedStock.available < editing.qty && (
                  <span className="ml-2 text-red-700">⚠️ 출고 수량이 가용 재고를 초과합니다.</span>
                )}
              </div>
            )}

            {warning && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{warning}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
