"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Search, Wrench, PowerOff, Power } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Equipment, EquipmentProcessType, EquipmentStatus } from "@/types";
import { EQUIPMENT_PROCESS_TYPES, EQUIPMENT_STATUSES } from "@/types";
import { formatDate } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

type Editable = Omit<Equipment, "id" | "createdAt" | "updatedAt"> & {
  id?: string; createdAt?: string; updatedAt?: string;
};

function emptyEquipment(): Editable {
  return {
    equipmentName: "",
    processType: "배합",
    status: "활성",
    location: "",
    note: "",
  };
}

export default function EquipmentClient({ initial }: { initial: Equipment[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Equipment[]>(initial);
  const [editing, setEditing] = useState<Editable | null>(null);
  const [q, setQ] = useState("");
  const [filterProcess, setFilterProcess] = useState<EquipmentProcessType | "전체">("전체");
  const [filterStatus, setFilterStatus] = useState<EquipmentStatus | "전체">("활성");
  const canEdit = useCanEdit("items");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/equipment");

  const filtered = useMemo(() => items.filter((e) => {
    if (filterProcess !== "전체" && e.processType !== filterProcess) return false;
    if (filterStatus !== "전체" && e.status !== filterStatus) return false;
    if (q) {
      const hay = `${e.equipmentName} ${e.location} ${e.note}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [items, q, filterProcess, filterStatus]);

  async function onSave() {
    if (!editing) return;
    if (!editing.equipmentName.trim()) return;
    const isNew = !editing.id;
    const res = await save<Equipment>(isNew ? "POST" : "PATCH", editing);
    if (!res.ok) return;
    if (res.data && res.data.id) {
      setItems((prev) => {
        if (isNew) return [...prev, res.data];
        return prev.map((e) => (e.id === res.data.id ? res.data : e));
      });
    }
    setEditing(null);
    fetch("/api/equipment", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j.data)) setItems(j.data); })
      .catch(() => { /* keep optimistic */ });
    router.refresh();
  }

  async function toggleStatus(e: Equipment) {
    const next: EquipmentStatus = e.status === "활성" ? "비활성" : "활성";
    const verb = next === "비활성" ? "비활성화" : "다시 활성화";
    if (!confirm(`이 설비를 ${verb} 하시겠습니까?\n\n${e.equipmentName}`)) return;
    const res = await save<Equipment>("PATCH", { id: e.id, status: next });
    if (!res.ok) return;
    if (res.data && res.data.id) {
      setItems((prev) => prev.map((x) => (x.id === res.data.id ? res.data : x)));
    }
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="설비관리"
        description="공정별 설비/장비 마스터. 일반 라인(배합/분산/사출/QC)과 업사이클링 선행 공정(입고확인/추출/정제/숙성)을 모두 등록할 수 있습니다."
        actions={
          <button className="btn-primary" onClick={() => setEditing(emptyEquipment())}
            disabled={!canEdit} title={!canEdit ? PERMISSION_TIP : undefined}>
            <Plus size={14} /> 설비 추가
          </button>
        }
      />

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8" placeholder="설비명·위치·비고 검색"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-36" value={filterProcess}
            onChange={(e) => setFilterProcess(e.target.value as EquipmentProcessType | "전체")}>
            <option value="전체">전체 공정</option>
            {EQUIPMENT_PROCESS_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input w-36" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as EquipmentStatus | "전체")}>
            <option value="전체">전체 상태</option>
            {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="ml-auto text-sm text-ink-500 tabular-nums">{filtered.length} / {items.length}건</div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>설비명</TH>
            <TH>공정</TH>
            <TH>상태</TH>
            <TH>위치</TH>
            <TH>비고</TH>
            <TH>생성일</TH>
            <TH>최근 수정</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? <Empty>조건에 맞는 설비가 없습니다.</Empty> :
            filtered.map((e) => (
              <TR key={e.id} highlight={e.status === "비활성"}>
                <TD>
                  <div className="font-medium text-ink-900 flex items-center gap-1">
                    <Wrench size={12} className="text-ink-500" />
                    {e.equipmentName}
                  </div>
                </TD>
                <TD>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{e.processType}</span>
                </TD>
                <TD>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    e.status === "활성"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-ink-100 text-ink-600 border-border"
                  }`}>{e.status}</span>
                </TD>
                <TD className="text-ink-700">{e.location}</TD>
                <TD className="text-ink-600 max-w-[260px] truncate">{e.note}</TD>
                <TD className="text-[11px] text-ink-500">{formatDate(e.createdAt)}</TD>
                <TD className="text-[11px] text-ink-500">{formatDate(e.updatedAt)}</TD>
                <TD className="text-right">
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => toggleStatus(e)} disabled={!canEdit}
                      className={`disabled:opacity-40 disabled:cursor-not-allowed ${
                        e.status === "활성" ? "text-ink-500 hover:text-red-600" : "text-ink-500 hover:text-emerald-700"
                      }`}
                      title={canEdit ? (e.status === "활성" ? "비활성화" : "다시 활성화") : PERMISSION_TIP}>
                      {e.status === "활성" ? <PowerOff size={14} /> : <Power size={14} />}
                    </button>
                    <button onClick={() => setEditing({ ...e })} disabled={!canEdit}
                      className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={canEdit ? "편집" : PERMISSION_TIP}>
                      <Pencil size={14} />
                    </button>
                  </div>
                </TD>
              </TR>
            ))
          }
        </TBody>
      </Table>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "설비 편집" : "설비 추가"}
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave}
            disabled={saving || !canEdit || !editing?.equipmentName.trim()}
            title={!canEdit ? PERMISSION_TIP : undefined}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">설비명 <span className="text-red-700">*</span></label>
              <input className="input" value={editing.equipmentName}
                onChange={(e) => setEditing({ ...editing, equipmentName: e.target.value })}
                placeholder="예: 3롤밀 #2 / 사출기 A-1" />
            </div>
            <div>
              <label className="label">공정</label>
              <select className="input" value={editing.processType}
                onChange={(e) => setEditing({ ...editing, processType: e.target.value as EquipmentProcessType })}>
                {EQUIPMENT_PROCESS_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">상태</label>
              <select className="input" value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as EquipmentStatus })}>
                {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">위치</label>
              <input className="input" value={editing.location}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                placeholder="예: 1공장 분산실" />
            </div>
            <div className="col-span-2">
              <label className="label">비고</label>
              <textarea className="input min-h-[60px]" value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
