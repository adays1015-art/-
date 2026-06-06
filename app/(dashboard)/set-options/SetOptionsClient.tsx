"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Copy } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { ProductType, SetComposition, SetOption, SetSize } from "@/types";
import { PRODUCT_TYPES, SET_SIZES } from "@/types";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

const EMPTY: SetOption = {
  id: "", productType: "오일파스텔", setSize: "10색",
  optionName: "", optionCode: "", isActive: true, note: "",
  salePrice: 0, commissionRate: 0,
};

export default function SetOptionsClient({
  initial, composition,
}: { initial: SetOption[]; composition: SetComposition[] }) {
  const router = useRouter();
  const [items, setItems] = useState<SetOption[]>(initial);
  const [editing, setEditing] = useState<SetOption | null>(null);
  const canEditSO = useCanEdit("set-options");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/set-options");

  async function onSave() {
    if (!editing) return;
    const isNew = !editing.id;
    const res = await save<SetOption>(isNew ? "POST" : "PATCH", editing);
    if (!res.ok) return;
    try {
      const fresh = await (await fetch("/api/set-options")).json();
      if (Array.isArray(fresh.data)) setItems(fresh.data);
    } catch { /* keep stale */ }
    router.refresh();
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="세트 옵션"
        description="제품유형 × 세트유형 × 옵션명 단위로 판매 가능한 세트를 정의합니다."
        actions={
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}
            disabled={!canEditSO} title={!canEditSO ? PERMISSION_TIP : undefined}
          ><Plus size={14} /> 옵션 추가</button>
        }
      />

      <Table>
        <THead>
          <TR>
            <TH>제품유형</TH><TH>세트유형</TH><TH>옵션명</TH><TH>옵션코드</TH>
            <TH className="text-right">구성 품목</TH><TH>활성</TH><TH>메모</TH><TH></TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {items.length === 0 ? <Empty>세트 옵션이 없습니다.</Empty> :
            items.map((s) => {
              const compCount = composition.filter((c) => c.setOptionId === s.id).length;
              return (
                <TR key={s.id}>
                  <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{s.productType}</span></TD>
                  <TD>{s.setSize}</TD>
                  <TD className="font-medium text-ink-900">{s.optionName}</TD>
                  <TD className="font-mono text-xs">{s.optionCode}</TD>
                  <TD className="text-right tabular-nums">{compCount}품목</TD>
                  <TD>
                    {s.isActive
                      ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">활성</span>
                      : <span className="text-xs px-1.5 py-0.5 rounded bg-bg-subtle text-ink-600 border border-border">비활성</span>}
                  </TD>
                  <TD className="text-ink-600 max-w-[240px] truncate">{s.note}</TD>
                  <TD className="text-right">
                    <Link href={`/set-composition?option=${s.id}`}
                      className="btn-ghost text-xs whitespace-nowrap">
                      구성 관리
                    </Link>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing({
                        ...s, id: "",
                        optionName: `${s.optionName} (복사)`,
                        optionCode: s.optionCode ? `${s.optionCode}-COPY` : "",
                      })}
                      disabled={!canEditSO}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed mr-2"
                      title={canEditSO ? "복사 (옵션명/코드 수정 후 저장)" : PERMISSION_TIP}
                    ><Copy size={14} /></button>
                    <button onClick={() => setEditing({ ...s })}
                      disabled={!canEditSO}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={canEditSO ? "편집" : PERMISSION_TIP}
                    ><Pencil size={14} /></button>
                  </TD>
                </TR>
              );
            })
          }
        </TBody>
      </Table>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "세트 옵션 편집" : "새 세트 옵션"}
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEditSO}
            title={!canEditSO ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">제품유형</label>
              <select className="input" value={editing.productType}
                onChange={(e) => setEditing({ ...editing, productType: e.target.value as ProductType })}>
                {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select></div>
            <div><label className="label">세트유형</label>
              <select className="input" value={editing.setSize}
                onChange={(e) => setEditing({ ...editing, setSize: e.target.value as SetSize })}>
                {SET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="label">옵션명</label>
              <input className="input" placeholder="거베라"
                value={editing.optionName} onChange={(e) => setEditing({ ...editing, optionName: e.target.value })} /></div>
            <div><label className="label">옵션코드</label>
              <input className="input font-mono" placeholder="OP-10-GBR"
                value={editing.optionCode} onChange={(e) => setEditing({ ...editing, optionCode: e.target.value })} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="opt-active" type="checkbox" checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} />
              <label htmlFor="opt-active" className="text-sm text-ink-700">활성</label>
            </div>
            <div className="col-span-2"><label className="label">메모</label>
              <textarea className="input min-h-[60px]" value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
