"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type {
  Fragrance, FragranceProductType, FragranceType, FragranceStatus,
} from "@/types";
import {
  FRAGRANCE_PRODUCT_TYPES, FRAGRANCE_TYPES, FRAGRANCE_STATUSES,
} from "@/types";
import { formatNumber } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

type EditableFragrance = Omit<Fragrance, "id" | "createdAt"> & { id?: string; createdAt?: string };

function emptyFragrance(): EditableFragrance {
  return {
    fragranceCode: "",
    fragranceName: "",
    productType: "향료",
    fragranceType: "기타",
    stock: 0,
    unit: "ml",
    safetyStock: 30,
    status: "사용중",
    note: "",
  };
}

export default function FragrancesClient({ initial }: { initial: Fragrance[] }) {
  const router = useRouter();
  const [fragrances, setFragrances] = useState<Fragrance[]>(initial);
  const [editing, setEditing] = useState<EditableFragrance | null>(null);
  const [q, setQ] = useState("");
  const [pt, setPt] = useState<FragranceProductType | "전체">("전체");
  const canEdit = useCanEdit("items");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/fragrances");

  const filtered = useMemo(() => fragrances.filter((f) => {
    if (pt !== "전체" && f.productType !== pt) return false;
    if (q && !`${f.fragranceCode} ${f.fragranceName}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [fragrances, q, pt]);

  async function onSave() {
    if (!editing) return;
    const isNew = !editing.id;
    const res = await save<Fragrance>(isNew ? "POST" : "PATCH", editing);
    if (!res.ok) return;
    // ─── Optimistic local update ─────────────────────────
    // Apply the server's authoritative response before the background
    // refetch so the table reflects the change instantly.
    if (res.data && res.data.id) {
      setFragrances((prev) => {
        if (isNew) return [res.data, ...prev];
        return prev.map((f) => (f.id === res.data.id ? res.data : f));
      });
    }
    setEditing(null);
    // Background refetch — confirms with full server state.
    fetch("/api/fragrances", { cache: "no-store" })
      .then((r) => r.json())
      .then((fresh) => { if (Array.isArray(fresh.data)) setFragrances(fresh.data); })
      .catch(() => { /* keep optimistic state */ });
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="향 마스터"
        description="향(fragrance) 마스터. 생산된 향은 원료재고에 향료 카테고리로 등록되어 품목BOM에서 일반 원료처럼 사용 가능합니다."
        actions={
          <button className="btn-primary" onClick={() => setEditing(emptyFragrance())}
            disabled={!canEdit} title={!canEdit ? PERMISSION_TIP : undefined}
          ><Plus size={14} /> 향 추가</button>
        }
      />

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <input className="input flex-1 min-w-[220px]"
            placeholder="향 코드·이름 검색"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-40" value={pt}
            onChange={(e) => setPt(e.target.value as FragranceProductType | "전체")}>
            <option value="전체">전체 유형</option>
            {FRAGRANCE_PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="ml-auto text-sm text-ink-500 tabular-nums">{filtered.length} / {fragrances.length}건</div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>향 코드</TH><TH>향 이름</TH>
            <TH>유형</TH><TH>계열</TH>
            <TH className="text-right">재고 (ml)</TH>
            <TH className="text-right">안전재고</TH>
            <TH>상태</TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? <Empty>조건에 맞는 향이 없습니다.</Empty> :
            filtered.map((f) => (
              <TR key={f.id}>
                <TD className="font-mono text-xs font-semibold text-ink-900">{f.fragranceCode}</TD>
                <TD className="font-medium text-ink-900">{f.fragranceName}</TD>
                <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{f.productType}</span></TD>
                <TD className="text-xs text-ink-700">{f.fragranceType}</TD>
                <TD className="text-right tabular-nums">{formatNumber(f.stock)} ml</TD>
                <TD className="text-right tabular-nums text-ink-600">{formatNumber(f.safetyStock)}</TD>
                <TD className="text-xs">{f.status}</TD>
                <TD className="text-right">
                  <button onClick={() => setEditing({ ...f })} disabled={!canEdit}
                    className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={canEdit ? "편집" : PERMISSION_TIP}>
                    <Pencil size={14} />
                  </button>
                </TD>
              </TR>
            ))
          }
        </TBody>
      </Table>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "향 편집" : "향 추가"}
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEdit}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">향 코드</label>
              <input className="input font-mono" value={editing.fragranceCode}
                onChange={(e) => setEditing({ ...editing, fragranceCode: e.target.value })} /></div>
            <div><label className="label">향 이름</label>
              <input className="input" value={editing.fragranceName}
                onChange={(e) => setEditing({ ...editing, fragranceName: e.target.value })} /></div>
            <div><label className="label">유형</label>
              <select className="input" value={editing.productType}
                onChange={(e) => setEditing({ ...editing, productType: e.target.value as FragranceProductType })}>
                {FRAGRANCE_PRODUCT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">향 계열</label>
              <select className="input" value={editing.fragranceType}
                onChange={(e) => setEditing({ ...editing, fragranceType: e.target.value as FragranceType })}>
                {FRAGRANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">재고 (ml)</label>
              <input className="input" type="number" value={editing.stock}
                onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
            <div><label className="label">안전재고</label>
              <input className="input" type="number" value={editing.safetyStock}
                onChange={(e) => setEditing({ ...editing, safetyStock: Number(e.target.value) })} /></div>
            <div><label className="label">단위</label>
              <input className="input" value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
            <div><label className="label">상태</label>
              <select className="input" value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as FragranceStatus })}>
                {FRAGRANCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div className="col-span-2"><label className="label">메모</label>
              <textarea className="input min-h-[60px]" value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
