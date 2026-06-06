"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, AlertTriangle, ExternalLink } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import Modal from "@/components/Modal";
import type { Item, ItemStatus, ProductType } from "@/types";
import { ITEM_STATUSES, PRODUCT_TYPES } from "@/types";
import { formatNumber } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

const EMPTY: Item = {
  id: "", itemNo: "", productType: "오일파스텔", colorName: "", colorCode: "",
  scentName: "", scentCode: "", status: "사용중",
  stock: 0, safetyStock: 100, unit: "개", productionUnit: 100, note: "",
};

export default function ItemsClient({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initial);
  const [q, setQ] = useState("");
  const [pt, setPt] = useState<ProductType | "전체">("전체");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const canEditItems = useCanEdit("items");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/items");

  const filtered = useMemo(() => items.filter((i) => {
    if (pt !== "전체" && i.productType !== pt) return false;
    if (lowOnly && i.stock >= i.safetyStock) return false;
    if (q) {
      // Search across visible fields only — colorCode / scent fields are
      // hidden from the UI so they're not part of the search corpus either.
      const s = `${i.itemNo} ${i.colorName}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => Number(a.itemNo) - Number(b.itemNo)), [items, q, pt, lowOnly]);

  async function onSave() {
    if (!editing) return;
    const isNew = !editing.id;
    const res = await save<Item>(isNew ? "POST" : "PATCH", editing);
    if (!res.ok) return;
    // Refetch from server so UI shows exactly what's in the sheet
    try {
      const refetch = await fetch("/api/items");
      const fresh = await refetch.json();
      if (Array.isArray(fresh.data)) setItems(fresh.data);
    } catch { /* keep stale local */ }
    router.refresh();
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="품목 마스터"
        description="시스템의 핵심 단위. 각 품목번호는 (제품유형 + 색상)의 고유한 조합이며, 자체 BOM과 재고를 갖습니다."
        actions={
          <button
            className="btn-primary"
            onClick={() => setEditing({ ...EMPTY })}
            disabled={!canEditItems}
            title={!canEditItems ? PERMISSION_TIP : undefined}
          >
            <Plus size={14} /> 품목 추가
          </button>
        }
      />

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8" placeholder="품목번호·색상명 검색"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-40" value={pt} onChange={(e) => setPt(e.target.value as ProductType | "전체")}>
            <option value="전체">전체 제품유형</option>
            {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            안전재고 미달만
          </label>
          <div className="ml-auto text-sm text-ink-500 tabular-nums">{filtered.length} / {items.length}품목</div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>품목번호</TH><TH>제품유형</TH><TH>색상</TH>
            <TH className="text-right">현재재고</TH><TH className="text-right">안전재고</TH>
            <TH>단위</TH><TH>상태</TH><TH></TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? <Empty>조건에 맞는 품목이 없습니다.</Empty> :
            filtered.map((it) => {
              const low = it.stock < it.safetyStock;
              return (
                <TR key={it.id} highlight={low}>
                  <TD><span className="font-mono font-semibold text-ink-900">{it.itemNo}</span></TD>
                  <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{it.productType}</span></TD>
                  <TD className="font-medium text-ink-900">{it.colorName}</TD>
                  <TD className="text-right tabular-nums">
                    <span className={low ? "text-red-700 font-semibold" : ""}>{formatNumber(it.stock)} {it.unit}</span>
                    {low && <AlertTriangle size={12} className="inline ml-1 text-red-600" />}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-600">{formatNumber(it.safetyStock)}</TD>
                  <TD>{it.unit}</TD>
                  <TD><StatusChip status={it.status} /></TD>
                  <TD className="text-right">
                    <Link href={`/items/${it.itemNo}`} className="text-ink-500 hover:text-ink-900 inline-flex items-center" title="추적 보기">
                      <ExternalLink size={14} />
                    </Link>
                  </TD>
                  <TD className="text-right">
                    <button
                      onClick={() => setEditing({ ...it })}
                      disabled={!canEditItems}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={canEditItems ? "편집" : PERMISSION_TIP}
                    ><Pencil size={14} /></button>
                  </TD>
                </TR>
              );
            })
          }
        </TBody>
      </Table>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "품목 편집" : "품목 추가"}
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button
            className="btn-primary"
            onClick={onSave}
            disabled={saving || !canEditItems}
            title={!canEditItems ? PERMISSION_TIP : undefined}
          >{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">품목번호</label>
              <input className="input font-mono" placeholder="예: 101"
                value={editing.itemNo} onChange={(e) => setEditing({ ...editing, itemNo: e.target.value })} /></div>
            <div><label className="label">제품유형</label>
              <select className="input" value={editing.productType}
                onChange={(e) => setEditing({ ...editing, productType: e.target.value as ProductType })}>
                {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select></div>
            <div><label className="label">표시색상명</label>
              <input className="input" value={editing.colorName}
                onChange={(e) => setEditing({ ...editing, colorName: e.target.value })} /></div>
            <div><label className="label">상태</label>
              <select className="input" value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as ItemStatus })}>
                {ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="label">단위</label>
              <input className="input" value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
            <div><label className="label">현재재고</label>
              <input className="input" type="number" value={editing.stock}
                onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
            <div><label className="label">안전재고</label>
              <input className="input" type="number" value={editing.safetyStock}
                onChange={(e) => setEditing({ ...editing, safetyStock: Number(e.target.value) })} /></div>
            <div className="col-span-2"><label className="label">메모</label>
              <textarea className="input min-h-[60px]" value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatusChip({ status }: { status: ItemStatus }) {
  const cls = status === "사용중" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "중단" ? "bg-bg-subtle text-ink-600 border-border"
    : "bg-amber-50 text-amber-700 border-amber-200";
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${cls}`}>{status}</span>;
}
