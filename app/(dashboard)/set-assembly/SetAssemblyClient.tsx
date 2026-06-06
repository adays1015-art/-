"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Item, LotStatus, SetAssemblyLot, SetComposition, SetOption } from "@/types";
import { LOT_STATUSES } from "@/types";
import { computeSetItemConsumption } from "@/lib/bomMath";
import { formatDate, formatNumber, todayISO } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import { useRouter } from "next/navigation";

function mapStatus(s: LotStatus): "예정" | "진행 중" | "완료" | "보류" {
  if (s === "진행중") return "진행 중";
  if (s === "완료") return "완료";
  if (s === "보류") return "보류";
  return "예정";
}

type EditableLot = Omit<SetAssemblyLot, "id" | "productType" | "setSize" | "optionName"> & {
  id?: string; productType?: SetAssemblyLot["productType"]; setSize?: SetAssemblyLot["setSize"]; optionName?: string;
};

function emptyLot(): EditableLot {
  return {
    date: todayISO(), setOptionId: "", qty: 30,
    assignee: "", status: "예정", note: "",
  };
}

export default function SetAssemblyClient({
  initial, options, composition, items,
}: {
  initial: SetAssemblyLot[]; options: SetOption[]; composition: SetComposition[]; items: Item[];
}) {
  const router = useRouter();
  const [lots, setLots] = useState<SetAssemblyLot[]>(initial);
  const canEditAsm = useCanEdit("set-assembly");
  const [editing, setEditing] = useState<EditableLot | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/set-assembly");

  const preview = useMemo(() => {
    if (!editing?.setOptionId || !editing.qty) return [];
    const comps = composition.filter((c) => c.setOptionId === editing.setOptionId);
    return computeSetItemConsumption(comps, editing.qty).map((u) => {
      const it = items.find((x) => x.itemNo === u.itemNo);
      return { ...u, label: it?.colorName ?? "-", stock: it?.stock ?? 0, unit: it?.unit ?? "" };
    });
  }, [editing, composition, items]);

  async function onSave() {
    if (!editing) return;
    setWarning(null);
    const isNew = !editing.id;
    const res = await save<SetAssemblyLot>(isNew ? "POST" : "PATCH", editing);
    if (!res.ok) return;
    try {
      const fresh = await (await fetch("/api/set-assembly")).json();
      if (Array.isArray(fresh.data)) setLots(fresh.data);
    } catch { /* keep stale */ }
    router.refresh();
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="세트 조립"
        description="세트 옵션 단위로 조립을 등록합니다. 진행중/완료가 되면 구성된 품목이 자동 차감되고, 완료 시 완제품 세트 재고가 증가합니다."
        actions={
          <button className="btn-primary" onClick={() => { setEditing(emptyLot()); setWarning(null); }}
            disabled={!canEditAsm} title={!canEditAsm ? PERMISSION_TIP : undefined}
          ><Plus size={14} /> 조립 LOT 추가</button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>조립일</TH><TH>세트</TH>
            <TH className="text-right">수량</TH>
            <TH>담당자</TH><TH>상태</TH><TH>메모</TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {lots.length === 0 ? <Empty>조립 LOT이 없습니다.</Empty> :
            lots.map((l) => (
              <TR key={l.id}>
                <TD>{formatDate(l.date)}</TD>
                <TD>
                  <div className="font-medium text-ink-900">{l.productType} {l.setSize} · {l.optionName}</div>
                  <div className="text-[11px] text-ink-500 font-mono">{l.id}</div>
                </TD>
                <TD className="text-right tabular-nums">{formatNumber(l.qty)}세트</TD>
                <TD>{l.assignee}</TD>
                <TD><StatusBadge status={mapStatus(l.status)} /></TD>
                <TD className="text-ink-600 max-w-[240px] truncate">{l.note}</TD>
                <TD className="text-right">
                  <button onClick={() => { setEditing({ ...l }); setWarning(null); }}
                    disabled={!canEditAsm}
                    className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canEditAsm ? "편집" : PERMISSION_TIP}
                  ><Pencil size={14} /></button>
                </TD>
              </TR>
            ))
          }
        </TBody>
      </Table>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "세트 조립 편집" : "새 세트 조립"}
        width="max-w-3xl"
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEditAsm}
            title={!canEditAsm ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">조립일</label>
                <input className="input" type="date" value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></div>
              <div><label className="label">담당자</label>
                <input className="input" value={editing.assignee}
                  onChange={(e) => setEditing({ ...editing, assignee: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">세트 옵션</label>
                <select className="input" value={editing.setOptionId}
                  onChange={(e) => setEditing({ ...editing, setOptionId: e.target.value })}>
                  <option value="">선택...</option>
                  {options.filter((o) => o.isActive).map((o) => (
                    <option key={o.id} value={o.id}>[{o.productType}] {o.setSize} · {o.optionName} ({o.optionCode})</option>
                  ))}
                </select></div>
              <div><label className="label">조립 수량 (세트)</label>
                <input className="input" type="number" value={editing.qty}
                  onChange={(e) => setEditing({ ...editing, qty: Number(e.target.value) })} /></div>
              <div><label className="label">상태</label>
                <select className="input" value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as LotStatus })}>
                  {LOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div className="col-span-2"><label className="label">메모</label>
                <textarea className="input min-h-[60px]" value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
            </div>

            {preview.length > 0 && (
              <div className="panel">
                <div className="px-4 py-2 border-b border-border bg-bg-subtle/50 text-sm font-medium">
                  품목 재고 차감 미리보기 ({preview.length}품목)
                </div>
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-th">품목번호</th>
                    <th className="table-th">품목명</th>
                    <th className="table-th text-right">차감 예정량</th>
                    <th className="table-th text-right">현재 재고</th>
                  </tr></thead>
                  <tbody>
                    {preview.map((u) => (
                      <tr key={u.itemNo}>
                        <td className="table-td font-mono">{u.itemNo}</td>
                        <td className="table-td">{u.label}</td>
                        <td className="table-td text-right tabular-nums">{formatNumber(u.amount)} {u.unit}</td>
                        <td className={`table-td text-right tabular-nums ${u.stock < u.amount ? "text-red-700 font-semibold" : "text-ink-600"}`}>
                          {formatNumber(u.stock)} {u.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {warning && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{warning}</div>
            )}

            <div className="text-xs text-ink-500 border-t border-border pt-3">
              · 상태가 <b>진행중</b>/<b>완료</b>일 때 구성 품목 재고가 자동 차감됩니다.<br />
              · 상태가 <b>완료</b>일 때 완제품 세트 재고가 (조립수량)만큼 증가합니다.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
