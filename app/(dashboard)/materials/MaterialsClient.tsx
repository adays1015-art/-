"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, AlertTriangle, Pencil, ArrowUpDown, RefreshCw, Wand2, History } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import Modal from "@/components/Modal";
import MaterialTimeline from "@/components/MaterialTimeline";
import type {
  Material, MaterialCategory, MaterialTransaction,
  ProductionExecutionMaterial, FragranceExecutionMaterial,
} from "@/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import {
  CATEGORY_PREFIX,
  SPEC_CATEGORIES,
  nextMaterialCode,
  parseMaterialCode,
} from "@/lib/materialCode";
import { optionsWithLegacy, unitHelperText, normalizeUnitCost, usageUnitFor, recommendedUnitForCategory, unitConsistencyWarning } from "@/lib/units";

// Spec categories listed first; legacy categories appended so existing rows
// remain editable.
const LEGACY_CATEGORIES: MaterialCategory[] = ["바인더", "용기", "스티커"];
const CATEGORIES: MaterialCategory[] = [...SPEC_CATEGORIES, ...LEGACY_CATEGORIES];

const EMPTY: Material = {
  id: "", materialCode: "", materialName: "", name: "",
  category: "기본원료", stock: 0, unit: "g", safetyStock: 0,
  supplier: "", unitPrice: 0, inboundDate: "", expiryDate: "", msds: false, note: "",
};

type SortKey = "materialCode" | "materialName" | "category" | "stock";
type SortDir = "asc" | "desc";

export default function MaterialsClient({
  initial, initialTransactions = [],
  initialProductionUsage = [], initialFragranceUsage = [],
}: {
  initial: Material[];
  initialTransactions?: MaterialTransaction[];
  initialProductionUsage?: ProductionExecutionMaterial[];
  initialFragranceUsage?: FragranceExecutionMaterial[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Material[]>(initial);
  const [transactions, setTransactions] = useState<MaterialTransaction[]>(initialTransactions);
  const [productionUsage, setProductionUsage] = useState<ProductionExecutionMaterial[]>(initialProductionUsage);
  const [fragranceUsage, setFragranceUsage] = useState<FragranceExecutionMaterial[]>(initialFragranceUsage);
  const canEditMat = useCanEdit("materials");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<MaterialCategory | "전체">("전체");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [timelineFor, setTimelineFor] = useState<Material | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  // Tracks whether the user has hand-edited materialCode in the open modal;
  // if so we stop auto-suggesting when they switch categories.
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  // Tracks whether the user has hand-edited unitCost in the open modal;
  // when false, unitCost auto-derives from unitPrice / capacity.
  const [unitCostManual, setUnitCostManual] = useState(false);
  // Tracks whether the user has hand-edited the unit field. When false,
  // changing 카테고리 suggests the recommended unit (ml for liquids, g for
  // solids, 개/장 for packaging).
  const [unitManuallyEdited, setUnitManuallyEdited] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("materialCode");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/materials");

  const existingCodes = useMemo(
    () => items.map((m) => m.materialCode || "").filter(Boolean),
    [items],
  );

  const filtered = useMemo(() => {
    const rows = items.filter((m) => {
      if (category !== "전체" && m.category !== category) return false;
      if (lowOnly && m.stock >= m.safetyStock) return false;
      const haystack = `${m.materialCode || ""} ${m.materialName || m.name} ${m.supplier} ${m.note}`.toLowerCase();
      if (q && !haystack.includes(q.toLowerCase())) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "stock") {
        return (a.stock - b.stock) * dir;
      }
      if (sortKey === "materialCode") {
        // Natural-ish sort: prefix asc, then numeric seq asc. Falls back to
        // raw string compare for codes that don't match the canonical shape.
        const pa = parseMaterialCode(a.materialCode || "");
        const pb = parseMaterialCode(b.materialCode || "");
        if (pa && pb) {
          if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix) * dir;
          return (pa.seq - pb.seq) * dir;
        }
        const sa = (a.materialCode || "").toString();
        const sb = (b.materialCode || "").toString();
        return sa.localeCompare(sb, "ko") * dir;
      }
      const va = ((a as unknown as Record<string, unknown>)[sortKey] ?? "").toString();
      const vb = ((b as unknown as Record<string, unknown>)[sortKey] ?? "").toString();
      return va.localeCompare(vb, "ko") * dir;
    });
    return rows;
  }, [items, q, category, lowOnly, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function openNew() {
    const suggested = nextMaterialCode("기본원료", existingCodes);
    setEditing({ ...EMPTY, materialCode: suggested });
    setCodeManuallyEdited(false);
    setUnitCostManual(false);
    setUnitManuallyEdited(false);
  }

  function openEdit(m: Material) {
    setEditing({ ...m });
    setCodeManuallyEdited(true); // editing an existing row — never auto-overwrite
    setUnitManuallyEdited(true);  // existing rows: never auto-rewrite the unit
    // Detect whether the existing unitCost matches the normalized auto formula.
    // If it diverges, the user previously typed it manually — preserve that.
    const expected = normalizeUnitCost({
      unitPrice: m.unitPrice ?? 0,
      capacity: Number(m.capacity ?? "") || 0,
      unit: m.unit ?? "",
    });
    setUnitCostManual(!!(m.unitCost && Math.round(m.unitCost) !== expected.unitCost));
  }

  function onCategoryChange(cat: MaterialCategory) {
    if (!editing) return;
    const nextCode = !codeManuallyEdited && !editing.id
      ? nextMaterialCode(cat, existingCodes)
      : editing.materialCode;
    // Suggest the recommended unit when:
    //   - user hasn't manually changed the unit yet, AND
    //   - this is a new row (we never rewrite an existing row's unit).
    // If both conditions hold we ALSO propagate the new unit to costUnit
    // (unless the user is already in manual unitCost mode, then leave it).
    const nextUnit = !unitManuallyEdited && !editing.id
      ? (recommendedUnitForCategory(cat) || editing.unit)
      : editing.unit;
    const nextCostUnit = !unitManuallyEdited && !editing.id && !unitCostManual
      ? (recommendedUnitForCategory(cat) || editing.costUnit)
      : editing.costUnit;
    setEditing({
      ...editing,
      category: cat,
      materialCode: nextCode,
      unit: nextUnit,
      costUnit: nextCostUnit,
    });
  }

  function onCodeChange(value: string) {
    if (!editing) return;
    setCodeManuallyEdited(true);
    setEditing({ ...editing, materialCode: value });
  }

  function regenerateCode() {
    if (!editing) return;
    setEditing({ ...editing, materialCode: nextMaterialCode(editing.category, existingCodes) });
    setCodeManuallyEdited(false);
  }

  async function openTimeline(m: Material) {
    setTimelineFor(m);
    // Refresh all timeline sources in parallel so the modal reflects the
    // latest 입출고 + 품목생산 사용 + 향생산 사용 history.
    setTimelineLoading(true);
    try {
      const [txRes, prodRes, fragRes] = await Promise.all([
        fetch("/api/material-transactions", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/production-execution", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        // Fragrance exec lives behind a combined endpoint that returns
        // { data: { lots, exec } }; we only need exec here.
        fetch("/api/fragrance-production", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (Array.isArray(txRes.data)) setTransactions(txRes.data);
      if (Array.isArray(prodRes.data)) setProductionUsage(prodRes.data);
      if (fragRes?.data?.exec && Array.isArray(fragRes.data.exec)) setFragranceUsage(fragRes.data.exec);
    } catch { /* keep stale */ }
    finally { setTimelineLoading(false); }
  }

  async function onSave() {
    if (!editing) return;
    const isNew = !editing.id;
    const payload: Material = {
      ...editing,
      // Keep both materialName + name in sync for back-compat readers.
      name: editing.materialName || editing.name,
      materialName: editing.materialName || editing.name,
    };
    const res = await save<Material>(isNew ? "POST" : "PATCH", payload);
    if (!res.ok) return;
    // ─── Optimistic local update ─────────────────────────
    // Apply the server's authoritative response (which has the canonical id
    // for new rows) before the background refetch, so the table reflects
    // the change instantly.
    if (res.data && res.data.id) {
      setItems((prev) => {
        if (isNew) return [res.data, ...prev];
        return prev.map((m) => (m.id === res.data.id ? res.data : m));
      });
    }
    setEditing(null);
    // Background refetch — confirms with full server state. Don't await.
    fetch("/api/materials", { cache: "no-store" })
      .then((r) => r.json())
      .then((fresh) => { if (Array.isArray(fresh.data)) setItems(fresh.data); })
      .catch(() => { /* keep optimistic state */ });
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="원료 재고"
        description="안료·향료·왁스·바인더·패키지 등 모든 원재료. 품목 생산 시 BOM 비율로 자동 차감됩니다."
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost"
              disabled
              title="기존 원료 코드를 일괄 재정렬합니다. (안전을 위해 일시적으로 비활성화 — 향후 마이그레이션 도구로 제공)"
            ><RefreshCw size={14} /> 코드 재정렬</button>
            <button className="btn-primary" onClick={openNew}
              disabled={!canEditMat} title={!canEditMat ? PERMISSION_TIP : undefined}
            ><Plus size={14} /> 원료 추가</button>
          </div>
        }
      />

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8" placeholder="원료코드·원료명·공급처·비고 검색"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-40" value={category}
            onChange={(e) => setCategory(e.target.value as MaterialCategory | "전체")}>
            <option value="전체">전체 카테고리</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c} · {CATEGORY_PREFIX[c]}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            안전재고 미달만
          </label>
          <div className="ml-auto text-sm text-ink-500 tabular-nums">{filtered.length} / {items.length}건</div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>
              <button className="inline-flex items-center gap-1 hover:text-ink-900" onClick={() => toggleSort("materialCode")}>
                원료코드 <ArrowUpDown size={10} className={sortKey === "materialCode" ? "text-ink-900" : "text-ink-400"} />
              </button>
            </TH>
            <TH>
              <button className="inline-flex items-center gap-1 hover:text-ink-900" onClick={() => toggleSort("materialName")}>
                원료명 <ArrowUpDown size={10} className={sortKey === "materialName" ? "text-ink-900" : "text-ink-400"} />
              </button>
            </TH>
            <TH>
              <button className="inline-flex items-center gap-1 hover:text-ink-900" onClick={() => toggleSort("category")}>
                카테고리 <ArrowUpDown size={10} className={sortKey === "category" ? "text-ink-900" : "text-ink-400"} />
              </button>
            </TH>
            <TH className="text-right">
              <button className="inline-flex items-center gap-1 hover:text-ink-900" onClick={() => toggleSort("stock")}>
                현재재고 <ArrowUpDown size={10} className={sortKey === "stock" ? "text-ink-900" : "text-ink-400"} />
              </button>
            </TH>
            <TH className="text-right">안전재고</TH>
            <TH>단위</TH>
            <TH>공급처</TH><TH className="text-right">단가</TH>
            <TH>입고일</TH><TH>MSDS</TH><TH>비고</TH>
            <TH>상태</TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? <Empty>조건에 맞는 원료가 없습니다.</Empty> :
            filtered.map((m) => {
              const low = m.stock < m.safetyStock;
              return (
                <TR key={m.id} highlight={low}>
                  <TD className="font-mono text-[13px] font-semibold text-ink-900">
                    {m.materialCode
                      ? <button type="button" className="hover:underline" onClick={() => openTimeline(m)} title="이력 타임라인 보기">{m.materialCode}</button>
                      : <span className="text-ink-400 font-normal">—</span>}
                  </TD>
                  <TD className="font-medium text-ink-900">
                    <button type="button" className="hover:underline text-left" onClick={() => openTimeline(m)} title="이력 타임라인 보기">
                      {m.materialName || m.name}
                    </button>
                  </TD>
                  <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{m.category}</span></TD>
                  <TD className="text-right tabular-nums">
                    <span className={low ? "text-amber-700 font-semibold" : ""}>{formatNumber(m.stock)} {m.unit}</span>
                    {low && <AlertTriangle size={12} className="inline ml-1 text-amber-600" />}
                  </TD>
                  <TD className="text-right tabular-nums text-ink-600">{formatNumber(m.safetyStock)} {m.unit}</TD>
                  <TD>
                    {(() => {
                      const buy = m.unit || "—";
                      const use = usageUnitFor(m) || buy;
                      return use && use !== buy
                        ? <span title={`구입 ${buy} → 사용 ${use}`}>{buy} <span className="text-ink-400">→</span> <span className="text-ink-700">{use}</span></span>
                        : <span>{buy}</span>;
                    })()}
                  </TD>
                  <TD>{m.supplier}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(m.unitPrice)}</TD>
                  <TD>{formatDate(m.inboundDate)}</TD>
                  <TD>{m.msds ? "✓" : "-"}</TD>
                  <TD className="text-ink-600 max-w-[200px] truncate">{m.note}</TD>
                  <TD>
                    {low
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">재고부족</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">정상</span>}
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button onClick={() => openTimeline(m)}
                        className="text-ink-500 hover:text-ink-900"
                        title="이력 타임라인 보기"
                      ><History size={14} /></button>
                      <button onClick={() => openEdit(m)}
                        disabled={!canEditMat}
                        className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={canEditMat ? "편집" : PERMISSION_TIP}
                      ><Pencil size={14} /></button>
                    </div>
                  </TD>
                </TR>
              );
            })
          }
        </TBody>
      </Table>

      <Modal open={!!timelineFor} onClose={() => setTimelineFor(null)}
        title={timelineFor ? `원료 이력 타임라인 — ${timelineFor.materialCode || ""} ${timelineFor.materialName || timelineFor.name}` : ""}
        width="max-w-3xl">
        {timelineFor && (
          <>
            {timelineLoading && <div className="mb-2 text-[11px] text-ink-500">최신 데이터 동기화 중…</div>}
            <MaterialTimeline
              material={timelineFor}
              transactions={transactions}
              productionUsage={productionUsage}
              fragranceUsage={fragranceUsage}
            />
          </>
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "원료 편집" : "원료 추가"}
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEditMat}
            title={!canEditMat ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">원료코드</label>
              <div className="flex gap-1">
                <input
                  className="input font-mono"
                  value={editing.materialCode ?? ""}
                  onChange={(e) => onCodeChange(e.target.value)}
                  placeholder={`${CATEGORY_PREFIX[editing.category]}-001`}
                />
                {!editing.id && (
                  <button
                    type="button"
                    className="btn-ghost shrink-0"
                    onClick={regenerateCode}
                    title="다음 코드 자동 생성"
                  ><Wand2 size={14} /></button>
                )}
              </div>
              <div className="text-[10px] text-ink-500 mt-1">
                {editing.id
                  ? "기존 원료 코드는 BOM/LOT/입출고 참조 무결성을 위해 수동으로만 변경하세요."
                  : `자동 제안: 카테고리 prefix = ${CATEGORY_PREFIX[editing.category]} · 직접 입력 가능`}
              </div>
            </div>
            <div>
              <label className="label">카테고리</label>
              <select className="input" value={editing.category}
                onChange={(e) => onCategoryChange(e.target.value as MaterialCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c} · {CATEGORY_PREFIX[c]}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className="label">원료명</label>
              <input className="input" value={editing.materialName ?? editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, materialName: e.target.value, name: e.target.value })} /></div>
            <div>
              <label className="label">단위</label>
              <select className="input" value={editing.unit}
                onChange={(e) => {
                  const next = e.target.value;
                  setUnitManuallyEdited(true);
                  setEditing((prev) => {
                    if (!prev) return prev;
                    const merged = { ...prev, unit: next };
                    if (!unitCostManual) {
                      const norm = normalizeUnitCost({
                        unitPrice: merged.unitPrice ?? 0,
                        capacity: Number(merged.capacity ?? "") || 0,
                        unit: next,
                      });
                      merged.unitCost = norm.unitCost;
                      merged.costUnit = norm.costUnit || next;
                    }
                    return merged;
                  });
                }}>
                <option value="">— 단위 선택 —</option>
                {optionsWithLegacy(editing.unit).map((o) => (
                  <option key={o.value} value={o.value}>{o.label} · {o.long}</option>
                ))}
              </select>
              {unitHelperText(editing.unit) && (
                <div className="text-[10px] text-ink-500 mt-0.5">{unitHelperText(editing.unit)}</div>
              )}
              {unitConsistencyWarning(editing.category, editing.costUnit || editing.unit) && (
                <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1">
                  ⚠ {unitConsistencyWarning(editing.category, editing.costUnit || editing.unit)}
                </div>
              )}
            </div>
            <div><label className="label">현재재고</label>
              <input className="input" type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
            <div><label className="label">안전재고</label>
              <input className="input" type="number" value={editing.safetyStock} onChange={(e) => setEditing({ ...editing, safetyStock: Number(e.target.value) })} /></div>
            <div><label className="label">공급처</label>
              <input className="input" value={editing.supplier} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} /></div>
            <div><label className="label">입고일</label>
              <input className="input" type="date" value={editing.inboundDate} onChange={(e) => setEditing({ ...editing, inboundDate: e.target.value })} /></div>

            {/* ─── 구입가 + 자동 단가 계산 ─────────────────── */}
            <div className="col-span-2 panel panel-pad bg-bg-subtle/40">
              <div className="text-[11px] font-semibold text-ink-800 mb-2">구입가 / 단가</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">구입단가 (원)</label>
                  <input className="input text-right tabular-nums" type="number"
                    value={editing.unitPrice || ""}
                    onChange={(e) => {
                      const next = Number(e.target.value) || 0;
                      setEditing((prev) => {
                        if (!prev) return prev;
                        const merged = { ...prev, unitPrice: next };
                        if (!unitCostManual) {
                          const norm = normalizeUnitCost({
                            unitPrice: next,
                            capacity: Number(merged.capacity ?? "") || 0,
                            unit: merged.unit ?? "",
                          });
                          merged.unitCost = norm.unitCost;
                          merged.costUnit = norm.costUnit || merged.unit || "";
                        }
                        return merged;
                      });
                    }} />
                </div>
                <div>
                  <label className="label">구입용량</label>
                  <div className="flex items-stretch gap-1">
                    <input className="input text-right tabular-nums" type="number" step="0.01"
                      value={editing.capacity ?? ""}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEditing((prev) => {
                          if (!prev) return prev;
                          const merged = { ...prev, capacity: next };
                          if (!unitCostManual) {
                            const norm = normalizeUnitCost({
                              unitPrice: merged.unitPrice ?? 0,
                              capacity: Number(next) || 0,
                              unit: merged.unit ?? "",
                            });
                            merged.unitCost = norm.unitCost;
                            merged.costUnit = norm.costUnit || merged.unit || "";
                          }
                          return merged;
                        });
                      }} />
                    <span className="inline-flex items-center px-2 text-xs text-ink-500 border border-border rounded-md bg-bg-panel min-w-[2.5rem] justify-center">
                      {editing.unit || "—"}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="label flex items-center gap-1">
                    자동 계산 단가
                    {unitCostManual && (
                      <button type="button"
                        className="text-[10px] text-beige-700 hover:underline ml-auto"
                        onClick={() => {
                          setUnitCostManual(false);
                          setEditing((prev) => {
                            if (!prev) return prev;
                            const norm = normalizeUnitCost({
                              unitPrice: prev.unitPrice ?? 0,
                              capacity: Number(prev.capacity ?? "") || 0,
                              unit: prev.unit ?? "",
                            });
                            return {
                              ...prev,
                              unitCost: norm.unitCost,
                              costUnit: norm.costUnit || prev.unit || "",
                            };
                          });
                        }}>자동 계산으로 되돌리기</button>
                    )}
                  </label>
                  <div className="flex items-stretch gap-1">
                    <input className={`input text-right tabular-nums ${unitCostManual ? "border-amber-300 bg-amber-50/40" : ""}`}
                      type="number"
                      value={editing.unitCost ?? 0}
                      onChange={(e) => {
                        setUnitCostManual(true);
                        setEditing((prev) => prev ? { ...prev, unitCost: Number(e.target.value) || 0 } : prev);
                      }} />
                    <span className="inline-flex items-center px-2 text-xs text-ink-500 border border-border rounded-md bg-bg-panel min-w-[3.5rem] justify-center whitespace-nowrap">
                      원/{editing.costUnit || editing.unit || "?"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-ink-600 leading-relaxed">
                {(() => {
                  const cap = Number(editing.capacity ?? "") || 0;
                  const up = editing.unitPrice ?? 0;
                  if (up > 0 && cap > 0) {
                    const norm = normalizeUnitCost({ unitPrice: up, capacity: cap, unit: editing.unit ?? "" });
                    const purchaseUnit = editing.unit || "?";
                    const normalized = norm.costUnit !== purchaseUnit;
                    return (
                      <span>
                        {formatNumber(up)}원 / {formatNumber(cap)}{purchaseUnit}
                        {" = "}
                        <b className="text-ink-900">{formatNumber(norm.unitCost)}원/{norm.costUnit || purchaseUnit}</b>
                        {normalized && (
                          <span className="ml-1 text-ink-500">
                            (정규화: 1{purchaseUnit} = {formatNumber(norm.normalizedCapacity / cap)}{norm.costUnit})
                          </span>
                        )}
                      </span>
                    );
                  }
                  return <span className="text-ink-400">구입단가와 구입용량을 입력하면 자동 계산됩니다.</span>;
                })()}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px] text-ink-500">
                <span>구입 단위: <b className="text-ink-700">{editing.unit || "—"}</b></span>
                <span>원가 단위: <b className="text-ink-700">{editing.costUnit || editing.unit || "—"}</b></span>
              </div>
              {unitCostManual && (
                <div className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  수동 단가가 적용 중입니다. 자동 계산으로 돌리려면 위의 [자동 계산으로 되돌리기]를 누르세요.
                </div>
              )}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="msds" type="checkbox" checked={editing.msds} onChange={(e) => setEditing({ ...editing, msds: e.target.checked })} />
              <label htmlFor="msds" className="text-sm text-ink-700">MSDS 보유</label>
            </div>
            <div className="col-span-2"><label className="label">비고</label>
              <textarea className="input min-h-[60px]" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
