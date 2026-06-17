"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, Search, History } from "lucide-react";
import Modal from "@/components/Modal";
import MaterialTimeline from "@/components/MaterialTimeline";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type {
  Material, MaterialTransaction, MaterialTransactionType,
  ProductionExecutionMaterial, FragranceExecutionMaterial,
} from "@/types";
import { MATERIAL_TRANSACTION_TYPES } from "@/types";
import { formatCurrency, formatDate, formatNumber, todayISO } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import { optionsWithLegacy, unitHelperText, normalizeUnitCost } from "@/lib/units";

interface DraftTransaction {
  transactionDate: string;
  transactionType: MaterialTransactionType;
  materialCode: string;
  manufacturer: string;
  supplier: string;
  qty: number;
  unit: string;
  // Purchase-side fields. unitPrice is a CLIENT-only helper for 입고; it is
  // NOT a 원료입출고 sheet column, but on save we push unitPrice + capacity
  // to the 원료재고 master so price tracking stays current.
  unitPrice: number;
  unitCost: number;
  capacity: string;
  totalCost: number;
  lotNo: string;
  expiryDate: string;
  disposalReason: string;
  note: string;
}

function emptyDraft(): DraftTransaction {
  return {
    transactionDate: todayISO(),
    transactionType: "입고",
    materialCode: "",
    manufacturer: "",
    supplier: "",
    qty: 0,
    unit: "",
    unitPrice: 0,
    unitCost: 0,
    capacity: "",
    totalCost: 0,
    lotNo: "",
    expiryDate: "",
    disposalReason: "",
    note: "",
  };
}

export default function MaterialTransactionsClient({
  initial, materials: initialMaterials,
}: {
  initial: MaterialTransaction[];
  materials: Material[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<MaterialTransaction[]>(initial);
  const [materials, setMaterials] = useState<Material[]>(initialMaterials);
  const [draft, setDraft] = useState<DraftTransaction>(emptyDraft());
  const canEdit = useCanEdit("materials");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/material-transactions");

  // ─── Filters ────────────────────────────────────────────
  const [filterQ, setFilterQ] = useState("");
  const [filterType, setFilterType] = useState<MaterialTransactionType | "전체">("전체");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [timelineFor, setTimelineFor] = useState<Material | null>(null);
  const [productionUsage, setProductionUsage] = useState<ProductionExecutionMaterial[]>([]);
  const [fragranceUsage, setFragranceUsage] = useState<FragranceExecutionMaterial[]>([]);

  const sortedMaterials = useMemo(
    () => materials.slice().sort((a, b) => (a.materialName || a.name).localeCompare(b.materialName || b.name)),
    [materials],
  );

  // 원료 선택용 카테고리 필터 — 원료가 많아 카테고리로 좁혀서 고른다.
  const [pickCategory, setPickCategory] = useState<string>("전체");
  const pickCategories = useMemo(
    () => Array.from(new Set(materials.map((m) => m.category).filter(Boolean))).sort(),
    [materials],
  );
  const pickableMaterials = useMemo(
    () => (pickCategory === "전체" ? sortedMaterials : sortedMaterials.filter((m) => m.category === pickCategory)),
    [sortedMaterials, pickCategory],
  );

  // When user picks a material, auto-fill convenient defaults from the master.
  function onPickMaterial(code: string) {
    const m = materials.find((x) => x.id === code || x.materialCode === code);
    setDraft({
      ...draft,
      materialCode: code,
      unit: m?.unit ?? draft.unit,
      unitPrice: m?.unitPrice ?? draft.unitPrice,
      unitCost: m?.unitCost ?? m?.unitPrice ?? draft.unitCost,
      capacity: m?.capacity ?? draft.capacity,
      supplier: m?.supplier ?? draft.supplier,
    });
  }

  // Live derived: normalize kg→g, L→ml so the production-side unitCost is
  // always in the smaller unit. Surfaces in the helper label; only
  // auto-applied to draft.unitCost when user types in unitPrice/capacity
  // (handled inline on each onChange).
  const derivedNorm = useMemo(() => normalizeUnitCost({
    unitPrice: Number(draft.unitPrice) || 0,
    capacity: Number(draft.capacity) || 0,
    unit: draft.unit,
  }), [draft.unitPrice, draft.capacity, draft.unit]);

  // Live totalCost = qty × unitCost. The user can still type-override.
  const computedTotal = useMemo(() => {
    const qty = Number(draft.qty) || 0;
    const uc = Number(draft.unitCost) || 0;
    return qty * uc;
  }, [draft.qty, draft.unitCost]);

  async function refetch() {
    try {
      const [txRes, matsRes] = await Promise.all([
        fetch("/api/material-transactions", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/materials", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (Array.isArray(txRes.data)) setRows(txRes.data);
      if (Array.isArray(matsRes.data)) setMaterials(matsRes.data);
    } catch { /* keep stale */ }
  }

  async function onSave() {
    if (!draft.materialCode) return;
    const m = materials.find((x) => x.id === draft.materialCode || x.materialCode === draft.materialCode);
    const payload = {
      transactionDate: draft.transactionDate,
      transactionType: draft.transactionType,
      materialCode: draft.materialCode,
      materialName: m?.materialName ?? m?.name ?? "",
      manufacturer: draft.manufacturer,
      supplier: draft.supplier,
      qty: Number(draft.qty) || 0,
      unit: draft.unit,
      unitCost: Number(draft.unitCost) || 0,
      capacity: draft.capacity,
      totalCost: Number(draft.totalCost) || computedTotal,
      lotNo: draft.lotNo,
      expiryDate: draft.expiryDate,
      disposalReason: draft.disposalReason,
      note: draft.note,
    };
    const res = await save<MaterialTransaction>("POST", payload);
    if (!res.ok) return;
    // ─── Optimistic local update ─────────────────────────
    if (res.data && res.data.id) {
      setRows((prev) => [res.data, ...prev]);
    }
    // ─── 입고: refresh master price/capacity if entered ─────
    // Side-channel patch — keeps 원료재고 price tracking current without
    // adding a new column to 원료입출고. Only fires on 입고 transactions
    // and only when the user actually entered a purchase price + capacity.
    if (
      draft.transactionType === "입고" && m
      && draft.unitPrice > 0
      && Number(draft.capacity) > 0
    ) {
      const norm = normalizeUnitCost({
        unitPrice: draft.unitPrice,
        capacity: Number(draft.capacity) || 0,
        unit: draft.unit,
      });
      try {
        await fetch("/api/materials", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: m.id,
            unitPrice: draft.unitPrice,
            capacity: draft.capacity,
            // Keep purchase unit on the master so future edits remember how
            // the user prefers to buy this material.
            unit: draft.unit || m.unit || "",
            // Normalized production-side cost + its matching costUnit.
            unitCost: Number(draft.unitCost) || norm.unitCost,
            costUnit: norm.costUnit || draft.unit || m.unit || "",
          }),
        });
      } catch { /* non-blocking — transaction succeeded; master refresh is best-effort */ }
    }
    setDraft(emptyDraft());
    // Background refetch — covers stock side-effects on the materials master.
    refetch();
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    return rows.filter((t) => {
      if (filterType !== "전체" && t.transactionType !== filterType) return false;
      const day = (t.transactionDate || "").slice(0, 10);
      if (filterFrom && day && day < filterFrom) return false;
      if (filterTo && day && day > filterTo) return false;
      if (q) {
        const hay = `${t.materialCode || ""} ${t.materialName || ""} ${t.lotNo || ""} ${t.supplier || ""} ${t.manufacturer || ""} ${t.note || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterQ, filterType, filterFrom, filterTo]);

  const sorted = useMemo(() =>
    filtered.slice().sort((a, b) => (b.createdAt || b.transactionDate).localeCompare(a.createdAt || a.transactionDate)),
  [filtered]);

  async function openTimelineForCode(code: string) {
    const m = materials.find((x) => x.materialCode === code || x.id === code);
    if (!m) return;
    setTimelineFor(m);
    // Lazily fetch production + fragrance execution rows for the timeline.
    // Read-only; doesn't trigger any save/deduction path.
    try {
      const [prodRes, fragRes] = await Promise.all([
        fetch("/api/production-execution", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/fragrance-production", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (Array.isArray(prodRes.data)) setProductionUsage(prodRes.data);
      if (fragRes?.data?.exec && Array.isArray(fragRes.data.exec)) setFragranceUsage(fragRes.data.exec);
    } catch { /* keep stale */ }
  }

  return (
    <div>
      <PageHeader
        title="원료 입출고"
        description="원료 입고/생산사용/폐기/재고조정 거래 이력. 저장 시 원료재고의 stock이 자동 조정됩니다."
      />

      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border bg-bg-subtle/50 flex items-center gap-2 text-sm font-semibold">
          <Plus size={14} className="text-ink-500" /> 새 거래 등록
        </div>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">거래일</label>
            <input className="input" type="date" value={draft.transactionDate}
              onChange={(e) => setDraft({ ...draft, transactionDate: e.target.value })} />
          </div>
          <div>
            <label className="label">거래유형</label>
            <select className="input" value={draft.transactionType}
              onChange={(e) => setDraft({ ...draft, transactionType: e.target.value as MaterialTransactionType })}>
              {MATERIAL_TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="label">원료 선택</label>
            <div className="flex gap-2">
              <select className="input max-w-[40%]" value={pickCategory}
                onChange={(e) => setPickCategory(e.target.value)}
                title="카테고리로 좁히기">
                <option value="전체">전체 카테고리</option>
                {pickCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input flex-1" value={draft.materialCode}
                onChange={(e) => onPickMaterial(e.target.value)}>
                <option value="">— 원료를 선택하세요{pickCategory !== "전체" ? ` (${pickableMaterials.length}개)` : ""} —</option>
                {pickableMaterials.map((m) => {
                  const key = m.materialCode || m.id;
                  return <option key={key} value={key}>
                    [{m.category}] {m.materialName || m.name} {m.materialCode ? `(${m.materialCode})` : ""}
                  </option>;
                })}
              </select>
            </div>
          </div>
          <div>
            <label className="label">제조사</label>
            <input className="input" value={draft.manufacturer}
              onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} />
          </div>
          <div>
            <label className="label">공급처</label>
            <input className="input" value={draft.supplier}
              onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} />
          </div>
          <div>
            <label className="label">수량 {draft.transactionType === "재고조정" ? "(±)" : ""}</label>
            <input className="input text-right tabular-nums" type="number" step="0.01"
              value={draft.qty}
              onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">단위</label>
            <select className="input" value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
              <option value="">— 단위 선택 —</option>
              {optionsWithLegacy(draft.unit).map((o) => (
                <option key={o.value} value={o.value}>{o.label} · {o.long}</option>
              ))}
            </select>
            {unitHelperText(draft.unit) && (
              <div className="text-[10px] text-ink-500 mt-0.5">{unitHelperText(draft.unit)}</div>
            )}
          </div>
          <div>
            <label className="label">구입단가 (원)</label>
            <input className="input text-right tabular-nums" type="number"
              value={draft.unitPrice || ""}
              placeholder="예: 20000"
              onChange={(e) => {
                const up = Number(e.target.value) || 0;
                const norm = normalizeUnitCost({
                  unitPrice: up, capacity: Number(draft.capacity) || 0, unit: draft.unit,
                });
                setDraft({
                  ...draft,
                  unitPrice: up,
                  unitCost: norm.unitCost > 0 ? norm.unitCost : draft.unitCost,
                });
              }} />
            <div className="text-[10px] text-ink-500 mt-0.5">입고 시 원료재고에 반영됩니다.</div>
          </div>
          <div>
            <label className="label">구입용량</label>
            <input className="input text-right tabular-nums" type="number" step="0.01"
              value={draft.capacity}
              placeholder="예: 1000"
              onChange={(e) => {
                const norm = normalizeUnitCost({
                  unitPrice: Number(draft.unitPrice) || 0,
                  capacity: Number(e.target.value) || 0,
                  unit: draft.unit,
                });
                setDraft({
                  ...draft,
                  capacity: e.target.value,
                  unitCost: norm.unitCost > 0 ? norm.unitCost : draft.unitCost,
                });
              }} />
            <div className="text-[10px] text-ink-500 mt-0.5">구입 단위: {draft.unit || "—"}</div>
          </div>
          <div>
            <label className="label">단가 (원/{derivedNorm.costUnit || draft.unit || "?"})</label>
            <input className="input text-right tabular-nums" type="number"
              value={draft.unitCost}
              onChange={(e) => setDraft({ ...draft, unitCost: Number(e.target.value) })} />
            <div className="text-[10px] text-ink-500 mt-0.5">
              {derivedNorm.unitCost > 0
                ? <>자동 계산: <b>{formatCurrency(derivedNorm.unitCost)}</b>/{derivedNorm.costUnit || draft.unit || "?"}</>
                : "구입단가/용량 입력 시 자동 계산"}
            </div>
            <div className="text-[10px] text-ink-500 mt-0.5">
              원가 단위: <b className="text-ink-700">{derivedNorm.costUnit || draft.unit || "—"}</b>
            </div>
          </div>
          <div>
            <label className="label">총액 (원)</label>
            <input className="input text-right tabular-nums" type="number"
              value={draft.totalCost || computedTotal}
              placeholder={`${computedTotal}`}
              onChange={(e) => setDraft({ ...draft, totalCost: Number(e.target.value) })} />
            <div className="text-[10px] text-ink-500 mt-0.5">자동 계산: {formatCurrency(computedTotal)}</div>
          </div>
          <div>
            <label className="label">LOT 번호</label>
            <input className="input font-mono" value={draft.lotNo}
              onChange={(e) => setDraft({ ...draft, lotNo: e.target.value })} />
          </div>
          <div>
            <label className="label">유통기한</label>
            <input className="input" type="date" value={draft.expiryDate}
              onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })} />
          </div>
          {draft.transactionType === "폐기" && (
            <div className="lg:col-span-2">
              <label className="label">폐기사유</label>
              <input className="input" value={draft.disposalReason}
                onChange={(e) => setDraft({ ...draft, disposalReason: e.target.value })} />
            </div>
          )}
          <div className={draft.transactionType === "폐기" ? "lg:col-span-2" : "lg:col-span-4"}>
            <label className="label">비고</label>
            <input className="input" value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>
        </div>

        <div className="px-4 pb-4 flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={() => setDraft(emptyDraft())}>초기화</button>
          <button className="btn-primary"
            disabled={saving || !canEdit || !draft.materialCode || (draft.qty === 0 && draft.transactionType !== "재고조정")}
            onClick={onSave}
            title={!canEdit ? PERMISSION_TIP : !draft.materialCode ? "원료를 먼저 선택하세요." : undefined}>
            {saving ? "저장 중..." : "거래 저장"}
          </button>
        </div>
      </div>

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-8" placeholder="원료코드·원료명·LOT·공급처·비고 검색"
              value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
          </div>
          <select className="input w-36" value={filterType}
            onChange={(e) => setFilterType(e.target.value as MaterialTransactionType | "전체")}>
            <option value="전체">전체 유형</option>
            {MATERIAL_TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <label className="text-[11px] text-ink-500">기간</label>
            <input className="input w-36" type="date" value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)} />
            <span className="text-ink-400">~</span>
            <input className="input w-36" type="date" value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)} />
          </div>
          {(filterQ || filterType !== "전체" || filterFrom || filterTo) && (
            <button className="btn-ghost text-xs"
              onClick={() => { setFilterQ(""); setFilterType("전체"); setFilterFrom(""); setFilterTo(""); }}>
              필터 초기화
            </button>
          )}
          <div className="ml-auto text-sm text-ink-500 tabular-nums">{filtered.length} / {rows.length}건</div>
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>거래일</TH>
            <TH>유형</TH>
            <TH>원료</TH>
            <TH>제조사 / 공급처</TH>
            <TH className="text-right">수량</TH>
            <TH className="text-right">단가</TH>
            <TH className="text-right">총액</TH>
            <TH>LOT</TH>
            <TH>유통기한</TH>
            <TH>비고</TH>
          </TR>
        </THead>
        <TBody>
          {sorted.length === 0 ? <Empty>거래 이력이 없습니다.</Empty> :
            sorted.map((t) => (
              <TR key={t.id}>
                <TD>{formatDate(t.transactionDate)}</TD>
                <TD>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    t.transactionType === "입고"     ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    t.transactionType === "생산사용" ? "bg-sky-50     text-sky-800     border-sky-200"     :
                    t.transactionType === "폐기"     ? "bg-red-50     text-red-800     border-red-200"     :
                                                       "bg-amber-50   text-amber-800   border-amber-200"
                  }`}>{t.transactionType}</span>
                </TD>
                <TD>
                  <button type="button" className="text-left hover:underline"
                    onClick={() => openTimelineForCode(t.materialCode)}
                    title="이력 타임라인 보기">
                    <div className="font-medium text-ink-900 flex items-center gap-1">
                      {t.materialName || "(없음)"}
                      <History size={11} className="text-ink-400" />
                    </div>
                    <div className="text-[10px] text-ink-500 font-mono">{t.materialCode}</div>
                  </button>
                </TD>
                <TD className="text-xs text-ink-700">
                  {t.manufacturer && <div>{t.manufacturer}</div>}
                  {t.supplier && <div className="text-ink-500">{t.supplier}</div>}
                </TD>
                <TD className="text-right tabular-nums">
                  {formatNumber(t.qty)} <span className="text-[10px] text-ink-500">{t.unit}</span>
                  {t.capacity && <div className="text-[10px] text-ink-500">{t.capacity}</div>}
                </TD>
                <TD className="text-right tabular-nums">{formatCurrency(t.unitCost)}</TD>
                <TD className="text-right tabular-nums font-medium">{formatCurrency(t.totalCost)}</TD>
                <TD className="font-mono text-xs">{t.lotNo}</TD>
                <TD className="text-xs">{formatDate(t.expiryDate)}</TD>
                <TD className="text-ink-600 max-w-[200px] truncate">
                  {t.disposalReason && <div className="text-red-700 text-[10px]">사유: {t.disposalReason}</div>}
                  {t.note}
                </TD>
              </TR>
            ))
          }
        </TBody>
      </Table>

      <div className="mt-4 text-[11px] text-ink-500 flex items-center gap-1">
        <ArrowLeftRight size={12} /> 저장 시 원료재고의 stock이 자동 조정됩니다. (입고: 증가 · 생산사용/폐기: 감소 · 재고조정: 입력값에 따라 ±)
      </div>

      <Modal open={!!timelineFor} onClose={() => setTimelineFor(null)}
        title={timelineFor ? `원료 이력 타임라인 — ${timelineFor.materialCode || ""} ${timelineFor.materialName || timelineFor.name}` : ""}
        width="max-w-3xl">
        {timelineFor && (
          <MaterialTimeline
            material={timelineFor}
            transactions={rows}
            productionUsage={productionUsage}
            fragranceUsage={fragranceUsage}
          />
        )}
      </Modal>
    </div>
  );
}
