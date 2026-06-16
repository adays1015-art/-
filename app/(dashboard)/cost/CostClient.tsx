"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Calculator, Tag, Layers, Sparkles, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type {
  CostCalculation, CostItem, Item, ItemBomLine, ItemLot, Material,
  ProductionExecutionMaterial, SetComposition, SetOption,
  SetBomLine, SetBomComponentType,
  FragranceLot, FragranceExecutionMaterial,
} from "@/types";
import {
  computeItemCost, computeSetCost,
  computeItemCostBreakdown, computeSetOptionCost,
  materialCostForItemNo, aggregateActualCostByItem,
  pickAppliedUnitCost, resolveMaterialUnitCost,
} from "@/lib/costMath";
import type { AppliedUnitCostResult } from "@/lib/costMath";
import { formatCurrency, formatDateKst, formatNumber } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

function emptyCost(): CostItem {
  return { id: "", name: "", amount: 0, unit: "원", basis: "", note: "" };
}

export default function CostClient({
  initial, initialCalculations,
  items: itemsMain, bom: bomMain, materials: materialsMain,
  setOptions, setComposition,
  setBom = [],
  itemLots: itemLotsMain, executionMaterials: execMain,
  fragranceLots = [], fragranceExec = [],
  upcycleItems = [], upcycleBom = [], upcycleLots = [], upcycleExec = [], upcycleMaterials = [],
}: {
  initial: CostItem[];
  initialCalculations: CostCalculation[];
  items: Item[];
  bom: ItemBomLine[];
  materials: Material[];
  setOptions: SetOption[];
  setComposition: SetComposition[];
  setBom?: SetBomLine[];
  itemLots: ItemLot[];
  executionMaterials: ProductionExecutionMaterial[];
  fragranceLots?: FragranceLot[];
  fragranceExec?: FragranceExecutionMaterial[];
  upcycleItems?: Item[];
  upcycleBom?: ItemBomLine[];
  upcycleLots?: ItemLot[];
  upcycleExec?: ProductionExecutionMaterial[];
  upcycleMaterials?: Material[];
}) {
  // 라인 토글 — 일반 품목 / 업사이클 품목. 업사이클일 때 품목·BOM·LOT·투입원료·
  // 원료(업사이클+기존 병합) 배열을 통째로 스왑하면 동일 계산기가 그대로 동작.
  const [costLine, setCostLine] = useState<"일반" | "업사이클">("일반");
  const isUpcycleCost = costLine === "업사이클";
  const items = isUpcycleCost ? upcycleItems : itemsMain;
  const bom = isUpcycleCost ? upcycleBom : bomMain;
  const itemLots = isUpcycleCost ? upcycleLots : itemLotsMain;
  const executionMaterials = isUpcycleCost ? upcycleExec : execMain;
  const materials = isUpcycleCost ? upcycleMaterials : materialsMain;

  const [costList, setCostList] = useState<CostItem[]>(initial);
  const canEditCost = useCanEdit("cost");
  const [drafts, setDrafts] = useState<Record<string, CostItem>>(
    Object.fromEntries(initial.map((c) => [c.id, c])),
  );
  const [newItem, setNewItem] = useState<CostItem | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { save: doSave, error: saveError, clearError, retry: retrySave, saving: savingCost } =
    useResourceSave("/api/cost");
  const { save: saveCalc, saving: savingCalc, error: calcError, clearError: clearCalcError, retry: retryCalc } =
    useResourceSave("/api/cost-calc");

  // ─── Per-unit calculator state ────────────────────────────
  const [calculations, setCalculations] = useState<CostCalculation[]>(initialCalculations);
  const sortedItems = useMemo(
    () => items.slice().sort((a, b) => Number(a.itemNo) - Number(b.itemNo)),
    [items],
  );
  const [calcItemNo, setCalcItemNo] = useState<string>(sortedItems[0]?.itemNo ?? "");
  const [expectedQty, setExpectedQty] = useState<number>(100);
  const [laborTotal, setLaborTotal] = useState<number>(0);
  const [packagingTotal, setPackagingTotal] = useState<number>(0);
  const [overheadTotal, setOverheadTotal] = useState<number>(0);
  const [defectRate, setDefectRate] = useState<number>(0);
  const [calcNote, setCalcNote] = useState<string>("");

  const breakdown = useMemo(() => computeItemCostBreakdown({
    itemNo: calcItemNo,
    bom, materials,
    expectedQty,
    laborTotal, packagingTotal, overheadTotal,
    defectRatePercent: defectRate,
  }), [calcItemNo, bom, materials, expectedQty, laborTotal, packagingTotal, overheadTotal, defectRate]);

  const [refetching, setRefetching] = useState(false);
  // Fetch the authoritative server copy so the set calculator immediately
  // reflects whatever was actually persisted (not just the optimistic guess).
  async function refetchCalculations(): Promise<void> {
    setRefetching(true);
    try {
      const j = await (await fetch("/api/cost-calc", { cache: "no-store" })).json();
      if (Array.isArray(j.data)) setCalculations(j.data as CostCalculation[]);
    } catch { /* swallow — keep current state */ }
    finally { setRefetching(false); }
  }

  async function saveItemCalculation() {
    if (!calcItemNo || !breakdown.qtyValid) return;
    const tempId = `__tmp-${Date.now()}`;
    const payload: CostCalculation = {
      id: "",
      targetType: "품목",
      targetCode: calcItemNo,
      itemNo: calcItemNo,
      // Per-unit (already defect-adjusted) values — matches user spec
      // "materialCost = 제품 1개당 재료비" etc.
      materialCost: Math.round(breakdown.materialPerUnit),
      packagingCost: Math.round(breakdown.packagingPerUnit),
      laborCost: Math.round(breakdown.laborPerUnit),
      overheadCost: Math.round(breakdown.overheadPerUnit),
      defectRate,
      totalCost: Math.round(breakdown.finalUnitCost),
      calculatedAt: new Date().toISOString(),
      note: calcNote,
    };
    // Optimistic: replace any existing 품목 row for this itemNo so the set
    // calculator picks up the new number immediately.
    const optimistic: CostCalculation = { ...payload, id: tempId };
    setCalculations((prev) => {
      const without = prev.filter(
        (c) => !(c.targetType === "품목" && c.itemNo === calcItemNo),
      );
      return [...without, optimistic];
    });

    const res = await saveCalc<CostCalculation>("POST", payload);
    if (!res.ok) {
      setCalculations((prev) => prev.filter((c) => c.id !== tempId));
      return;
    }
    if (res.data) {
      const saved = res.data as CostCalculation;
      setCalculations((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
    }
    // Refetch from server — set calculator must reflect the persisted row,
    // not the optimistic one (in case server normalized fields differently).
    await refetchCalculations();
  }

  // ─── Set-cost calculator state ────────────────────────────
  const [calcSetId, setCalcSetId] = useState<string>(setOptions[0]?.id ?? "");
  const [setPackagingCost, setSetPackagingCost] = useState<number>(0);
  const [setLaborCost, setSetLaborCost] = useState<number>(0);
  const [setOverheadCost, setSetOverheadCost] = useState<number>(0);
  const [setNote, setSetNote] = useState<string>("");
  const setBreakdown = useMemo(() => {
    const so = setOptions.find((o) => o.id === calcSetId);
    if (!so) return null;
    return {
      option: so,
      ...computeSetOptionCost({
        setOption: so,
        composition: setComposition,
        items, bom, materials,
        calculations,
        itemLots,
        executionMaterials,
        setPackagingCost,
        setLaborCost,
        setOverheadCost,
      }),
    };
  }, [
    calcSetId, setOptions, setComposition, items, bom, materials,
    calculations, itemLots, executionMaterials,
    setPackagingCost, setLaborCost, setOverheadCost,
  ]);

  async function saveSetCalculation() {
    if (!setBreakdown) return;
    const tempId = `__tmp-${Date.now()}`;
    const targetCode = setBreakdown.option.optionCode || setBreakdown.option.id;
    const payload: CostCalculation = {
      id: "",
      targetType: "세트",
      targetCode,
      itemNo: "",
      materialCost: Math.round(setBreakdown.itemTotal),
      packagingCost: Math.round(setBreakdown.packaging),
      laborCost: Math.round(setBreakdown.labor),
      overheadCost: Math.round(setBreakdown.overhead),
      defectRate: 0,
      totalCost: Math.round(setBreakdown.total),
      calculatedAt: new Date().toISOString(),
      note: setNote,
    };
    // Optimistic: replace any existing 세트 row for this targetCode.
    const optimistic: CostCalculation = { ...payload, id: tempId };
    setCalculations((prev) => {
      const without = prev.filter(
        (c) => !(c.targetType === "세트" && c.targetCode === targetCode),
      );
      return [...without, optimistic];
    });

    const res = await saveCalc<CostCalculation>("POST", payload);
    if (!res.ok) {
      setCalculations((prev) => prev.filter((c) => c.id !== tempId));
      return;
    }
    if (res.data) {
      const saved = res.data as CostCalculation;
      setCalculations((prev) => prev.map((c) => (c.id === tempId ? saved : c)));
    }
    await refetchCalculations();
  }

  // Indicator: is there a saved 품목 row for the currently-selected itemNo?
  // Same matching rules as getItemUnitCost: tolerate "item", match itemNo or
  // targetCode as strings, saved-wins regardless of totalCost.
  const savedForCurrentItem = useMemo(() => {
    const needle = String(calcItemNo ?? "").trim();
    if (!needle) return null;
    const matches = calculations
      .filter((c) => {
        const t = c.targetType as unknown;
        if (t !== "품목" && t !== "item") return false;
        return (
          String(c.itemNo ?? "").trim() === needle ||
          String(c.targetCode ?? "").trim() === needle
        );
      })
      .sort((a, b) => (b.calculatedAt || "").localeCompare(a.calculatedAt || ""));
    return matches[0] ?? null;
  }, [calcItemNo, calculations]);

  // ─── Auto-calculated per-item costs ──────────────────────
  const itemCosts = useMemo(
    () => items
      .slice()
      .sort((a, b) => Number(a.itemNo) - Number(b.itemNo))
      .map((it) => ({
        item: it,
        ...computeItemCost({ item: it, bom, materials, costItems: costList }),
      })),
    [items, bom, materials, costList],
  );

  // ─── Per-item BOM (standard) + 실제 (actual) production aggregate ───
  // No save needed — auto-calculated from BOM + materials + LOTs + exec rows
  // every render. Status filter is strict Korean "완료" (see costMath).
  const itemActualRows = useMemo(() => {
    return items
      .slice()
      .sort((a, b) => Number(a.itemNo) - Number(b.itemNo))
      .map((it) => {
        const bomPerUnit = materialCostForItemNo(it.itemNo, bom, materials).perUnit;
        const agg = aggregateActualCostByItem(it.itemNo, itemLots, executionMaterials, materials, bom);
        // 4-tier 적용 1개 원가 — 최근 LOT → 가중평균 → BOM/현재고 → BOM 총원가
        const applied = pickAppliedUnitCost({
          latestLotCost: agg.latestLotCost,
          weightedAverageCost: agg.weightedAverageCost,
          bomTotalCost: bomPerUnit,
          currentStock: Number(it.stock) || 0,
          completedLotCount: agg.completedLotCount,
        });
        return { item: it, bomPerUnit, applied, ...agg };
      });
  }, [items, bom, materials, itemLots, executionMaterials]);

  // (debug console logs removed for production performance)

  // ─── Fragrance LOT cost aggregation ──────────────────────
  // Per-LOT split: 일반 원재료 원가 vs 향료 원가 (category="향료") +
  // 총 원가 + 단위 원가. Status mapping: prefer new `status`, fall back
  // to inventoryStatus → 사용가능=완료, 폐기=폐기, 테스트=테스트.
  function resolveFragranceLotStatus(l: FragranceLot): string {
    if (l.status) return l.status;
    if (l.inventoryStatus === "사용가능") return "완료";
    if (l.inventoryStatus === "폐기") return "폐기";
    if (l.inventoryStatus === "테스트") return "테스트";
    return "(미지정)";
  }
  const fragranceRows = useMemo(() => {
    return fragranceLots
      .slice()
      .sort((a, b) => (b.productionDate || "").localeCompare(a.productionDate || ""))
      .map((l) => {
        const rows = fragranceExec.filter((e) => e.lotNo === l.lotNo);
        let normalCost = 0;
        let fragranceCost = 0;
        for (const r of rows) {
          const m = materials.find(
            (x) => (r.materialCode && (x.materialCode === r.materialCode || x.id === r.materialCode)) || x.id === r.materialCode,
          );
          const isFragrance = m?.category === "향료";
          const cost = r.materialCost && r.materialCost > 0
            ? r.materialCost
            : r.actualQty * (r.unitCost > 0 ? r.unitCost : (m?.unitCost ?? m?.unitPrice ?? 0));
          if (isFragrance) fragranceCost += cost;
          else             normalCost    += cost;
        }
        const total = normalCost + fragranceCost;
        const unit = l.actualProducedQty > 0 ? total / l.actualProducedQty : 0;
        return {
          lot: l,
          status: resolveFragranceLotStatus(l),
          execRowCount: rows.length,
          normalCost, fragranceCost, total, unitCost: unit,
        };
      });
  }, [fragranceLots, fragranceExec, materials]);

  // Aggregate header (완료 only).
  const fragranceAgg = useMemo(() => {
    const completed = fragranceRows.filter((r) => r.status === "완료");
    let qty = 0, norm = 0, frag = 0, tot = 0;
    for (const r of completed) {
      qty += r.lot.actualProducedQty || 0;
      norm += r.normalCost;
      frag += r.fragranceCost;
      tot  += r.total;
    }
    return {
      completedCount: completed.length,
      totalQty: qty,
      totalNormal: norm,
      totalFragrance: frag,
      totalCost: tot,
      averageUnitCost: qty > 0 ? tot / qty : 0,
    };
  }, [fragranceRows]);

  // ─── Auto-calculated per-set costs ───────────────────────
  const setCosts = useMemo(
    () => setOptions.map((opt) => ({
      option: opt,
      ...computeSetCost({ option: opt, composition: setComposition, items, bom, materials, costItems: costList }),
    })),
    [setOptions, setComposition, items, bom, materials, costList],
  );

  function setDraft(id: string, patch: Partial<CostItem>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(c: CostItem) {
    const id = c.id || "new";
    setSavingId(id);
    // Optimistic merge — apply the draft into the list immediately so the
    // input shows the new value before the network round-trip resolves.
    const snapshot = costList;
    if (c.id) {
      setCostList((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    }
    try {
      const res = await doSave<CostItem>("POST", c);
      if (!res.ok) {
        setCostList(snapshot);
        return;
      }
      const saved = (res.data as CostItem | undefined) ?? c;
      if (!c.id) {
        // Newly inserted row — append the server-issued copy with its real id.
        setCostList((prev) => [...prev, saved]);
        setDrafts((d) => ({ ...d, [saved.id]: saved }));
        setNewItem(null);
      } else {
        setCostList((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
        setDrafts((d) => ({ ...d, [saved.id]: saved }));
      }
    } finally { setSavingId(null); }
  }

  function costRow(c: CostItem, isNew = false) {
    const id = c.id || "new";
    return (
      <TR key={id}>
        <TD className="min-w-[220px]">
          <input className="input" value={c.name} placeholder="항목명"
            onChange={(e) => isNew ? setNewItem({ ...c, name: e.target.value }) : setDraft(c.id, { name: e.target.value })} />
        </TD>
        <TD>
          <input className="input text-right tabular-nums" type="number" value={c.amount}
            onChange={(e) => isNew ? setNewItem({ ...c, amount: Number(e.target.value) }) : setDraft(c.id, { amount: Number(e.target.value) })} />
        </TD>
        <TD>
          <input className="input w-20" value={c.unit}
            onChange={(e) => isNew ? setNewItem({ ...c, unit: e.target.value }) : setDraft(c.id, { unit: e.target.value })} />
        </TD>
        <TD>
          <input className="input" placeholder="예: 품목 생산 1개당" value={c.basis}
            onChange={(e) => isNew ? setNewItem({ ...c, basis: e.target.value }) : setDraft(c.id, { basis: e.target.value })} />
        </TD>
        <TD>
          <input className="input" value={c.note}
            onChange={(e) => isNew ? setNewItem({ ...c, note: e.target.value }) : setDraft(c.id, { note: e.target.value })} />
        </TD>
        <TD className="text-right">
          <button className="btn-beige text-xs" disabled={savingId === id || !canEditCost}
            title={!canEditCost ? PERMISSION_TIP : undefined} onClick={() => save(c)}>
            <Save size={12} /> 저장
          </button>
        </TD>
      </TR>
    );
  }

  // ─── Search-driven item picker state ─────────────────────
  // The cost tab is now single-item focused: pick one item via search/select,
  // then render its 1개 원가 + 재고 금액 + LOT 이력. Avoids dumping all items
  // into one giant table when the catalog grows.
  const [costSearch, setCostSearch] = useState<string>("");
  const [selectedItemNo, setSelectedItemNo] = useState<string>("");
  const filteredItems = useMemo(() => {
    const q = costSearch.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((it) =>
      (it.itemNo ?? "").toLowerCase().includes(q) ||
      (it.colorName ?? "").toLowerCase().includes(q) ||
      (it.productType ?? "").toLowerCase().includes(q),
    );
  }, [sortedItems, costSearch]);
  const selectedRow = useMemo(
    () => itemActualRows.find((r) => r.item.itemNo === selectedItemNo) ?? null,
    [itemActualRows, selectedItemNo],
  );
  // Recently produced items — top 6 by latestLot.date (only those that have one).
  const recentItemRows = useMemo(() => {
    return itemActualRows
      .filter((r) => r.latestLot && r.latestLot.date)
      .slice()
      .sort((a, b) => (b.latestLot?.date ?? "").localeCompare(a.latestLot?.date ?? ""))
      .slice(0, 6);
  }, [itemActualRows]);
  // Recent LOTs — top 8 by date, exclude 삭제됨.
  const recentLotRows = useMemo(() => {
    return itemLots
      .filter((l) => l.status !== "삭제됨")
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 8);
  }, [itemLots]);

  return (
    <div>
      <PageHeader
        title="원가 계산"
        description="품목을 선택해서 1개 원가 · 재고 금액 · LOT 이력을 조회합니다. 세트 원가는 별도 계산기."
        actions={
          <div className="flex gap-1 rounded-lg border border-border bg-bg-panel p-0.5">
            {(["일반", "업사이클"] as const).map((ln) => (
              <button key={ln} type="button"
                className={`px-3 py-1.5 rounded-md text-sm transition ${
                  costLine === ln
                    ? (ln === "업사이클" ? "bg-emerald-600 text-white" : "bg-ink-900 text-white")
                    : "text-ink-600 hover:bg-bg-subtle"}`}
                onClick={() => { setCostLine(ln); setCalcItemNo(""); }}>
                {ln === "업사이클" ? "업사이클 품목" : "일반 품목"}
              </button>
            ))}
          </div>
        }
      />

      {/* ─── 조립 BOM (세트BOM) 패널 — 원가계산 화면에서 숨김 ────
          향후 별도 관리 화면(/set-bom 등)으로 분리 예정. 컴포넌트
          정의는 유지하되 여기서는 렌더링하지 않습니다. API/fetch/계산
          로직은 그대로 살아 있어 SalesMarginCalculator가 setBom을
          사용해 세트 원가를 산출합니다.
          진단이 필요하면 /api/set-bom endpoint 직접 호출. */}

      {/* SalesMarginCalculator moved below the item-detail section — see further down. */}

      {/* ─── 1개당 원가 계산기 (legacy — hidden) ─────────────
          generic accounting-style 계산기 (laborCost / overheadCost /
          targetType / targetCode 저장) 는 실제 제조 원가와 분리하기 위해
          숨김 처리합니다. 실제 원가는 아래 Section A/B에서 자동 조회됩니다. */}
      <div style={{ display: "none" }} aria-hidden>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={14} className="text-ink-500" /> 제품 1개 원가 계산기
            {calcItemNo && (
              savedForCurrentItem ? (
                <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200"
                  title={`저장 일시: ${savedForCurrentItem.calculatedAt}`}>
                  저장된 품목 원가 사용 중 · {formatCurrency(savedForCurrentItem.totalCost)}
                </span>
              ) : (
                <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  BOM 기준 임시 계산 — 저장되지 않음
                </span>
              )
            )}
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">품목번호</label>
              <select className="input" value={calcItemNo} onChange={(e) => setCalcItemNo(e.target.value)}>
                {sortedItems.length === 0 && <option value="">(품목 없음)</option>}
                {sortedItems.map((it) => (
                  <option key={it.itemNo} value={it.itemNo}>
                    {it.itemNo}번 · {it.colorName} ({it.productType})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">예상 생산수량</label>
              <input className="input text-right tabular-nums" type="number" min={1}
                value={expectedQty} onChange={(e) => setExpectedQty(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">총 인건비 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={laborTotal} onChange={(e) => setLaborTotal(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">포장비 — 배치 총액 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={packagingTotal} onChange={(e) => setPackagingTotal(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">제조간접비 — 배치 총액 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={overheadTotal} onChange={(e) => setOverheadTotal(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">불량률 (%)</label>
              <input className="input text-right tabular-nums" type="number" min={0} max={99.9} step={0.1}
                value={defectRate} onChange={(e) => setDefectRate(Number(e.target.value))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">비고</label>
              <input className="input" value={calcNote}
                placeholder="예: 2026-05 1차 생산 기준" onChange={(e) => setCalcNote(e.target.value)} />
            </div>
          </div>

          {/* Guidance — divide-by-zero on 생산수량 takes priority. */}
          {!breakdown.qtyValid ? (
            <div className="px-4 pb-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded mx-4 p-2">
              <b>생산수량</b>이 0이거나 비어 있어 1개당 원가를 계산할 수 없습니다. 1 이상의 숫자를 입력하세요.
            </div>
          ) : sortedItems.length === 0 ? (
            <div className="px-4 pb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded mx-4 p-2">
              품목이 등록되어 있지 않습니다. 먼저 <b>품목 마스터</b>에서 itemNo를 등록하세요.
            </div>
          ) : breakdown.lines.length === 0 ? (
            <div className="px-4 pb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded mx-4 p-2">
              선택한 품목번호의 <b>품목 BOM</b>이 비어 있습니다. 재료비를 계산하려면 BOM을 먼저 등록하세요.
            </div>
          ) : breakdown.materialPerUnit === 0 ? (
            <div className="px-4 pb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded mx-4 p-2">
              BOM은 있지만 매칭된 <b>원료 단가(unitCost)</b>가 0입니다. 원료재고 시트의 unitCost를 확인하세요.
            </div>
          ) : null}

          {/* Hero card: 제품 1개 원가 is the primary number. */}
          <div className="px-4 pb-3">
            <div className="rounded-xl border-2 border-ink-900 bg-ink-900 text-bg p-4">
              <div className="text-[11px] uppercase tracking-wider opacity-80">제품 1개 원가</div>
              <div className={`mt-1 font-bold tabular-nums ${breakdown.qtyValid ? "text-3xl" : "text-base opacity-70"}`}>
                {breakdown.qtyValid ? formatCurrency(breakdown.finalUnitCost) : "계산 불가 — 생산수량 필요"}
              </div>
              <div className="text-[11px] opacity-80 mt-1">
                {breakdown.qtyValid
                  ? `${calcItemNo || "?"}번 · ${expectedQty.toLocaleString("ko-KR")}개 생산 · 불량률 ${breakdown.defectRate}% 반영`
                  : "생산수량을 1 이상 입력하세요"}
              </div>
            </div>
          </div>

          {/* Secondary: 총 생산 원가 (참고). Smaller, muted. */}
          <div className="px-4 pb-2 flex items-center justify-between rounded-md mx-4 bg-bg-subtle border border-border px-3 py-2">
            <div className="text-xs text-ink-600">총 생산 원가 (참고)</div>
            <div className="text-sm font-medium tabular-nums">{formatCurrency(breakdown.totalProductionCost)}</div>
          </div>

          {/* Per-unit-first breakdown. */}
          <div className="px-4 pb-2 mt-2">
            <table className="w-full text-sm">
              <tbody>
                <tr><td className="py-1 text-ink-600">품목번호</td>
                  <td className="py-1 text-right font-mono">{calcItemNo || "-"}</td></tr>
                <tr><td className="py-1 text-ink-600">생산수량</td>
                  <td className={`py-1 text-right tabular-nums ${breakdown.qtyValid ? "" : "text-red-600 font-semibold"}`}>
                    {breakdown.qtyValid ? `${expectedQty.toLocaleString("ko-KR")} 개` : "(입력 필요)"}
                  </td></tr>

                {/* Per-unit section — the important block. */}
                <tr className="border-t border-border">
                  <td className="py-1.5 text-ink-900 font-semibold" colSpan={2}>제품 1개 기준 원가</td></tr>
                <tr><td className="py-1 text-ink-700 pl-2">제품 1개당 재료비</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(breakdown.materialPerUnit)}</td></tr>
                <tr><td className="py-1 text-ink-700 pl-2">제품 1개당 인건비</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(breakdown.laborPerUnit)}</td></tr>
                <tr><td className="py-1 text-ink-700 pl-2">제품 1개당 포장비</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(breakdown.packagingPerUnit)}</td></tr>
                <tr><td className="py-1 text-ink-700 pl-2">제품 1개당 제조간접비</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(breakdown.overheadPerUnit)}</td></tr>
                <tr><td className="py-1 text-ink-600 pl-2">1개당 원가 (불량 반영 전)</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(breakdown.unitBeforeDefect)}</td></tr>
                <tr className="bg-bg-subtle">
                  <td className="py-2 font-semibold pl-2">최종 제품 1개 원가</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-base">
                    {formatCurrency(breakdown.finalUnitCost)}
                  </td></tr>

                {/* Secondary block — 총 생산 원가 components, kept small. */}
                <tr className="border-t border-border">
                  <td className="py-1.5 text-ink-500 font-medium text-xs" colSpan={2}>
                    참고 · 총 생산 원가 (재료비 + 인건비 + 포장비 + 제조간접비)
                  </td></tr>
                <tr><td className="py-0.5 text-xs text-ink-500 pl-2">재료비</td>
                  <td className="py-0.5 text-right tabular-nums text-xs text-ink-600">{formatCurrency(breakdown.materialSubtotal)}</td></tr>
                <tr><td className="py-0.5 text-xs text-ink-500 pl-2">총 인건비</td>
                  <td className="py-0.5 text-right tabular-nums text-xs text-ink-600">{formatCurrency(breakdown.laborTotal)}</td></tr>
                <tr><td className="py-0.5 text-xs text-ink-500 pl-2">포장비</td>
                  <td className="py-0.5 text-right tabular-nums text-xs text-ink-600">{formatCurrency(breakdown.packagingTotal)}</td></tr>
                <tr><td className="py-0.5 text-xs text-ink-500 pl-2">제조간접비</td>
                  <td className="py-0.5 text-right tabular-nums text-xs text-ink-600">{formatCurrency(breakdown.overheadTotal)}</td></tr>
                <tr><td className="py-0.5 text-xs text-ink-600 pl-2">총 생산 원가</td>
                  <td className="py-0.5 text-right tabular-nums text-xs text-ink-700 font-medium">{formatCurrency(breakdown.totalProductionCost)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="px-4 pb-4 flex justify-end">
            <button className="btn-primary"
              disabled={!canEditCost || savingCalc || !calcItemNo || !breakdown.qtyValid}
              onClick={saveItemCalculation}
              title={!canEditCost ? PERMISSION_TIP : !breakdown.qtyValid ? "생산수량을 1 이상 입력하세요." : undefined}
            ><Calculator size={14} /> 품목 원가 저장</button>
          </div>
        </div>

        {/* ─── 세트 원가 계산기 ─────────────────────────── */}
        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Layers size={14} className="text-ink-500" /> 세트 원가 계산기
            <button
              type="button"
              onClick={refetchCalculations}
              disabled={refetching}
              className="ml-auto text-[11px] font-medium flex items-center gap-1 px-2 py-1 rounded border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50"
              title="원가계산 시트의 최신 행을 다시 불러옵니다."
            ><RefreshCw size={12} className={refetching ? "animate-spin" : ""} />
              원가 다시 불러오기
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">세트 옵션</label>
              <select className="input" value={calcSetId} onChange={(e) => setCalcSetId(e.target.value)}>
                {setOptions.length === 0 && <option value="">(세트 없음)</option>}
                {setOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    [{o.productType}] {o.setSize} · {o.optionName} ({o.optionCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">세트 포장비 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={setPackagingCost} onChange={(e) => setSetPackagingCost(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">세트 포장 인건비 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={setLaborCost} onChange={(e) => setSetLaborCost(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">세트 제조간접비 (원)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={setOverheadCost} onChange={(e) => setSetOverheadCost(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">비고</label>
              <input className="input" value={setNote}
                onChange={(e) => setSetNote(e.target.value)} />
            </div>
          </div>

          {setOptions.length === 0 && (
            <div className="mx-4 mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
              세트 옵션이 등록되어 있지 않습니다. <b>세트 옵션 / 세트 구성</b> 페이지에서 먼저 등록하세요.
            </div>
          )}
          {setBreakdown && (
            <>
              {/* Hero: 세트 1개 원가 — primary number for the set side. */}
              <div className="px-4 pb-3">
                <div className="rounded-xl border-2 border-ink-900 bg-ink-900 text-bg p-4">
                  <div className="text-[11px] uppercase tracking-wider opacity-80">세트 1개 원가</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">
                    {formatCurrency(setBreakdown.total)}
                  </div>
                  <div className="text-[11px] opacity-80 mt-1">
                    {setBreakdown.option.optionName} · {setBreakdown.breakdown.length}품목 구성
                    <span className="ml-2">
                      · 저장 {setBreakdown.savedCount} · LOT 실원가 {setBreakdown.actualCount} · BOM 추정 {setBreakdown.bomCount}
                      {setBreakdown.missingCount > 0 ? ` · 원가 없음 ${setBreakdown.missingCount}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {(setBreakdown.bomCount > 0 || setBreakdown.missingCount > 0) && (
                <div className="mx-4 mb-2 text-[11px] rounded border border-amber-200 bg-amber-50 text-amber-900 p-2 space-y-0.5">
                  <div>
                    <b>세트 1개 원가는 각 구성품을 1단위씩 사용한다고 가정합니다.</b>
                    {" "}우선순위는 <b>저장된 품목 원가 → 최신 LOT 실 원가 → BOM 기준 추정</b>입니다.
                  </div>
                  {setBreakdown.bomCount > 0 && (
                    <div>
                      · {setBreakdown.bomCount}개 품목은 LOT 실 원가가 없어 <b>BOM 기준 추정값</b>을 사용합니다.
                      품목 생산 페이지에서 실제 생산수량과 실 원료 투입을 기록하면 갱신됩니다.
                    </div>
                  )}
                  {setBreakdown.missingCount > 0 && (
                    <div className="text-red-800">
                      · {setBreakdown.missingCount}개 품목은 저장값도 LOT 데이터도 BOM 단가도 없어 0원으로 계산됩니다.
                    </div>
                  )}
                </div>
              )}

              <div className="px-4 pb-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-th">itemNo</th>
                      <th className="table-th text-right">savedTotalCost</th>
                      <th className="table-th text-right">LOT 실 원가</th>
                      <th className="table-th text-right">BOM 추정</th>
                      <th className="table-th text-right">itemUnitCostUsed</th>
                      <th className="table-th text-right">qtyInSet</th>
                      <th className="table-th text-right">subtotal</th>
                      <th className="table-th">원가 출처</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setBreakdown.breakdown.length === 0 ? (
                      <tr><td className="table-td text-ink-500" colSpan={8}>구성 품목이 없습니다.</td></tr>
                    ) : setBreakdown.breakdown.map((b) => {
                      const chip =
                        b.source === "saved"
                          ? { label: "저장된 품목 원가", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" }
                          : b.source === "actual"
                            ? { label: "LOT 실 원가", cls: "bg-sky-50 text-sky-800 border-sky-200" }
                            : b.source === "bom"
                              ? { label: "BOM 기준 추정", cls: "bg-amber-50 text-amber-800 border-amber-200" }
                              : { label: "원가 없음", cls: "bg-red-50 text-red-800 border-red-200" };
                      const tooltip =
                        b.source === "saved"
                          ? "원가계산.totalCost (제품 1개 원가)"
                          : b.source === "actual" && b.actualLot
                            ? `LOT ${b.actualLot.lotCode} · ${b.actualLot.date} · actualProducedQty ${b.actualLot.actualProducedQty}`
                            : b.source === "bom"
                              ? "BOM 자재 × 단가 (per-piece)"
                              : "저장값도 LOT도 BOM 단가도 없음";
                      return (
                        <tr key={b.itemNo}>
                          <td className="table-td">
                            <span className="font-mono text-xs text-ink-900 mr-2">{b.itemNo}</span>
                            <span className="text-xs text-ink-500">{b.colorName}</span>
                          </td>
                          <td className="table-td text-right tabular-nums">
                            {b.savedTotalCost != null ? formatCurrency(b.savedTotalCost) : <span className="text-ink-400">—</span>}
                          </td>
                          <td className="table-td text-right tabular-nums">
                            {b.source === "actual" ? formatCurrency(b.perUnit) : <span className="text-ink-400">—</span>}
                          </td>
                          <td className="table-td text-right tabular-nums">
                            {b.bomEstimate > 0 ? formatCurrency(b.bomEstimate) : <span className="text-ink-400">—</span>}
                          </td>
                          <td className="table-td text-right tabular-nums font-medium">{formatCurrency(b.perUnit)}</td>
                          <td className="table-td text-right tabular-nums">×{b.qty}</td>
                          <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(b.subtotal)}</td>
                          <td className="table-td">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chip.cls}`} title={tooltip}>
                              {chip.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    <tr><td className="table-td text-ink-700">품목 원가 합계 (1세트분)</td>
                      <td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(setBreakdown.itemTotal)}</td>
                      <td className="table-td"></td></tr>
                    <tr><td className="table-td text-ink-700">세트 포장비</td>
                      <td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(setBreakdown.packaging)}</td>
                      <td className="table-td"></td></tr>
                    <tr><td className="table-td text-ink-700">세트 포장 인건비</td>
                      <td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(setBreakdown.labor)}</td>
                      <td className="table-td"></td></tr>
                    <tr><td className="table-td text-ink-700">세트 제조간접비</td>
                      <td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(setBreakdown.overhead)}</td>
                      <td className="table-td"></td></tr>
                    <tr className="bg-bg-subtle">
                      <td className="table-td font-semibold" colSpan={6}>세트 1개 원가</td>
                      <td className="table-td text-right tabular-nums font-semibold text-base">{formatCurrency(setBreakdown.total)}</td>
                      <td className="table-td"></td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="px-4 pb-4 flex justify-end">
            <button className="btn-primary" disabled={!canEditCost || savingCalc || !setBreakdown}
              onClick={saveSetCalculation}
              title={!canEditCost ? PERMISSION_TIP : undefined}
            ><Calculator size={14} /> 세트 원가 저장</button>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <SaveErrorPanel error={calcError} onClose={clearCalcError}
          onRetry={() => retryCalc()} retrying={savingCalc} />
      </div>
      </div>

      {/* ─── 품목 선택 (검색 + 셀렉트) ──────────────────────
          원가계산탭은 한 번에 한 품목만 보여줍니다. 검색어로 필터,
          select로 한 품목을 골라야 아래 상세 패널이 나타납니다. */}
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Tag size={14} className="text-ink-500" /> 품목 선택
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            품목번호 / 색상명 / 상품유형으로 검색 후 선택 · 한 품목 단위로 1개 원가 · 재고 금액 · LOT 이력 조회
          </span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="label">검색</label>
            <input className="input" value={costSearch}
              onChange={(e) => setCostSearch(e.target.value)}
              placeholder="예: 703 · 거베라 · 오일파스텔" />
          </div>
          <div>
            <label className="label">품목 ({filteredItems.length}개)</label>
            <select className="input" value={selectedItemNo}
              onChange={(e) => setSelectedItemNo(e.target.value)}>
              <option value="">— 품목 선택 —</option>
              {filteredItems.map((it) => (
                <option key={it.itemNo} value={it.itemNo}>
                  [{it.itemNo}] {it.colorName} · {it.productType}
                </option>
              ))}
            </select>
          </div>
          <div>
            {selectedItemNo ? (
              <button className="btn-ghost text-xs"
                onClick={() => { setSelectedItemNo(""); }}>
                선택 해제
              </button>
            ) : (
              <span className="text-[11px] text-ink-400">선택된 품목 없음</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Default landing: 최근 품목 + 최근 LOT ─────────
          품목을 선택하지 않은 상태에서만 표시. 한눈에 최근 활동을 보고
          "상세" 버튼으로 해당 품목을 픽업할 수 있도록 합니다. */}
      {!selectedRow && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="panel">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
              <Tag size={14} className="text-ink-500" /> 최근 생산 품목 (Top {recentItemRows.length})
              <span className="ml-2 text-[11px] font-normal text-ink-500">최근 LOT 기준</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>품목번호</TH>
                    <TH>품목명</TH>
                    <TH className="text-right">현재고</TH>
                    <TH className="text-right">적용 원가</TH>
                    <TH>최근 생산일</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {recentItemRows.length === 0 ? <Empty>최근 생산된 품목이 없습니다.</Empty> :
                    recentItemRows.map((r) => {
                      const apply = r.applied.cost;
                      return (
                        <TR key={r.item.itemNo}>
                          <TD className="font-mono text-xs">{r.item.itemNo}</TD>
                          <TD>
                            <div className="font-medium">{r.item.colorName}</div>
                            <div className="text-[11px] text-ink-500">{r.item.productType}</div>
                          </TD>
                          <TD className="text-right tabular-nums">
                            {formatNumber(r.item.stock)} <span className="text-[10px] text-ink-500">{r.item.unit}</span>
                          </TD>
                          <TD className="text-right tabular-nums font-semibold">
                            {apply > 0 ? formatCurrency(apply) : <span className="text-ink-400">—</span>}
                            <div className="text-[10px] font-normal text-ink-500">{r.applied.source}</div>
                          </TD>
                          <TD className="font-mono text-xs">{r.latestLot ? formatDateKst(r.latestLot.date) : <span className="text-ink-400">—</span>}</TD>
                          <TD>
                            <button className="btn-ghost text-xs" onClick={() => setSelectedItemNo(r.item.itemNo)}>
                              상세
                            </button>
                          </TD>
                        </TR>
                      );
                    })
                  }
                </TBody>
              </Table>
            </div>
          </div>
          <div className="panel">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
              <Calculator size={14} className="text-ink-500" /> 최근 LOT (Top {recentLotRows.length})
              <span className="ml-2 text-[11px] font-normal text-ink-500">전체 생산 기록 최신순</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>LOT</TH>
                    <TH>품목</TH>
                    <TH>생산일</TH>
                    <TH className="text-right">1개 실제 원가</TH>
                    <TH>상태</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {recentLotRows.length === 0 ? <Empty>최근 LOT이 없습니다.</Empty> :
                    recentLotRows.map((l) => {
                      const it = items.find((i) => i.itemNo === l.itemNo);
                      const qty = l.actualProducedQty ?? l.completedQty ?? 0;
                      const totalCost = (l.actualMaterialTotalCost && l.actualMaterialTotalCost > 0)
                        ? l.actualMaterialTotalCost
                        : executionMaterials
                            .filter((e) => (l.lotCode && e.lotNo === l.lotCode) || (e.lotId && e.lotId === l.id))
                            .reduce((s, r) => s + (r.materialCost > 0 ? r.materialCost : r.actualQty * (r.unitCost > 0 ? r.unitCost : 0)), 0);
                      const unitCost = (l.actualUnitCost && l.actualUnitCost > 0)
                        ? l.actualUnitCost
                        : (qty > 0 && totalCost > 0 ? totalCost / qty : 0);
                      const statusChip =
                        l.status === "완료" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                        l.status === "테스트" ? "bg-purple-50 text-purple-800 border-purple-200" :
                        l.status === "폐기" ? "bg-red-50 text-red-800 border-red-300 font-semibold" :
                        "bg-bg-subtle text-ink-700 border-border";
                      return (
                        <TR key={l.id}>
                          <TD className="font-mono text-xs">{l.lotCode}</TD>
                          <TD>
                            <div className="font-mono text-[10px] text-ink-500">{l.itemNo}</div>
                            <div className="font-medium text-xs">{it?.colorName ?? "—"}</div>
                          </TD>
                          <TD className="font-mono text-xs">{l.date ? formatDateKst(l.date) : <span className="text-ink-400">—</span>}</TD>
                          <TD className="text-right tabular-nums">{unitCost > 0 ? formatCurrency(unitCost) : <span className="text-ink-400">—</span>}</TD>
                          <TD>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusChip}`}>
                              {l.status || "(미지정)"}
                            </span>
                          </TD>
                          <TD>
                            <button className="btn-ghost text-xs" onClick={() => setSelectedItemNo(l.itemNo)}>
                              상세
                            </button>
                          </TD>
                        </TR>
                      );
                    })
                  }
                </TBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Selected item detail: A. 기본 정보 / B. 1개 원가 / C. 재고 금액 / D. LOT 이력 ─── */}
      {selectedRow && (() => {
        const r = selectedRow;
        const apply = r.applied;            // { cost, source, debug }
        const applyChip =
          apply.source === "최근 LOT"   ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
          apply.source === "가중평균"   ? "bg-sky-50 text-sky-800 border-sky-200" :
          apply.source === "BOM/현재고" ? "bg-amber-50 text-amber-800 border-amber-200" :
          apply.source === "BOM 참고"   ? "bg-orange-50 text-orange-800 border-orange-200" :
          "bg-bg-subtle text-ink-500 border-border";
        const stock = apply.debug.currentStock;

        // ── 향료 원가 분리 — 최근 완료 LOT 투입원료 우선, 없으면 BOM 기준 ──
        // 향료 판별: category === "향료" (+ 호환 필드 materialType / materialGroup / type)
        type MatLike = Material & {
          materialType?: string; materialGroup?: string; type?: string;
        };
        const isFragranceMaterial = (m: Material | null | undefined): boolean => {
          if (!m) return false;
          const mm = m as MatLike;
          if (mm.category === "향료") return true;
          if (mm.materialType === "향료") return true;
          if (mm.materialGroup === "fragrance") return true;
          if (mm.type === "fragrance") return true;
          return false;
        };
        const fragranceBreakdown = (() => {
          const itemNo = r.item.itemNo;
          // 1) LOT-based: latest completed LOT executionMaterials
          const completedLots = itemLots
            .filter((l) => l.itemNo === itemNo && l.status === "완료")
            .slice()
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
          for (const lot of completedLots) {
            const rows = executionMaterials.filter(
              (e) => (lot.lotCode && e.lotNo === lot.lotCode) || (e.lotId && e.lotId === lot.id),
            );
            const qty = lot.actualProducedQty || lot.completedQty || 0;
            if (rows.length > 0 && qty > 0) {
              let normalTotal = 0;
              let fragTotal = 0;
              for (const row of rows) {
                const mat = materials.find(
                  (m) => (row.materialCode && (m.materialCode === row.materialCode || m.id === row.materialCode)) || m.id === row.materialCode,
                ) ?? null;
                const cost = row.materialCost > 0
                  ? row.materialCost
                  : row.actualQty * (row.unitCost > 0 ? row.unitCost : resolveMaterialUnitCost(mat));
                if (isFragranceMaterial(mat)) fragTotal += cost;
                else normalTotal += cost;
              }
              const generalCost = normalTotal / qty;
              const fragranceCost = fragTotal / qty;
              const total = generalCost + fragranceCost;
              return {
                source: `최근 LOT (${lot.lotCode})`,
                generalCost, fragranceCost, totalCost: total,
                fragranceShare: total > 0 ? (fragranceCost / total) * 100 : 0,
              };
            }
          }
          // 2) BOM-based fallback (per-1-piece)
          const bomLines = bom.filter((b) => b.itemNo === itemNo);
          let normalSub = 0;
          let fragSub = 0;
          for (const line of bomLines) {
            const mat = materials.find(
              (m) => m.id === line.materialId || (line.materialCode && (m.materialCode === line.materialCode || m.id === line.materialCode)),
            ) ?? null;
            const unitCost = resolveMaterialUnitCost(mat);
            const subtotal = line.amountPerUnit * unitCost;
            if (isFragranceMaterial(mat)) fragSub += subtotal;
            else normalSub += subtotal;
          }
          const total = normalSub + fragSub;
          return {
            source: "BOM 기준",
            generalCost: normalSub,
            fragranceCost: fragSub,
            totalCost: total,
            fragranceShare: total > 0 ? (fragSub / total) * 100 : 0,
          };
        })();
        const stockValue = stock * apply.cost;
        // D. LOT history — only this item's lots, exclude 삭제됨, newest first.
        const lotHistory = itemLots
          .filter((l) => l.itemNo === r.item.itemNo && l.status !== "삭제됨")
          .slice()
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return (
          <>
            {/* A. 기본 정보 */}
            <div className="panel mb-4">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Tag size={14} className="text-ink-500" /> A. 기본 정보
                <span className="ml-2 text-[11px] font-normal text-ink-500">
                  [{r.item.itemNo}] {r.item.colorName}
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">품목번호</div>
                  <div className="font-mono mt-0.5">{r.item.itemNo}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">품목명</div>
                  <div className="mt-0.5">
                    {r.item.colorName}
                    <span className="text-[10px] text-ink-500 ml-1">({r.item.productType})</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">현재고</div>
                  <div className="mt-0.5 tabular-nums">
                    {formatNumber(r.item.stock)} <span className="text-[10px] text-ink-500">{r.item.unit}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">최근 LOT</div>
                  <div className="mt-0.5 font-mono text-xs">{r.latestLot?.lotCode ?? <span className="text-ink-400">—</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">최근 생산일</div>
                  <div className="mt-0.5 font-mono text-xs">{r.latestLot ? formatDateKst(r.latestLot.date) : <span className="text-ink-400">—</span>}</div>
                </div>
              </div>
            </div>

            {/* B. 제품 1개 원가 */}
            <div className="panel mb-4">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Calculator size={14} className="text-ink-500" /> B. 제품 1개 원가
                <span className="ml-2 text-[11px] font-normal text-ink-500">
                  적용 원가 fallback: 최근 LOT → 가중평균 → BOM/현재고 → BOM 참고
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-800">1순위 — 최근 LOT</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {apply.debug.latestLotCost > 0 ? formatCurrency(apply.debug.latestLotCost) : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">
                    {r.latestLot ? `${r.latestLot.lotCode} · ${formatDateKst(r.latestLot.date)}` : "완료 LOT 없음"}
                  </div>
                </div>
                <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-sky-800">2순위 — 가중평균</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {apply.debug.weightedAverageCost > 0 ? formatCurrency(apply.debug.weightedAverageCost) : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">완료 LOT {apply.debug.completedLotCount}건</div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-800">3순위 — BOM/현재고</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {apply.debug.bomDividedByStock > 0 ? formatCurrency(apply.debug.bomDividedByStock) : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">
                    {apply.debug.bomTotalCost > 0 && apply.debug.currentStock > 0
                      ? `${formatCurrency(apply.debug.bomTotalCost)} ÷ ${formatNumber(apply.debug.currentStock)}${r.item.unit}`
                      : (apply.debug.currentStock === 0 ? "현재고 0 — 사용 불가" : "BOM 0")}
                  </div>
                </div>
                <div className="rounded-md border border-orange-200 bg-orange-50/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-orange-800">4순위 — BOM 참고</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {apply.debug.bomTotalCost > 0 ? formatCurrency(apply.debug.bomTotalCost) : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">Σ(BOM 소요량 × 원료 단가)</div>
                </div>
                <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider opacity-80">적용 원가</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {apply.cost > 0 ? formatCurrency(apply.cost) : "—"}
                  </div>
                  <div className="mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${applyChip}`}>출처: {apply.source}</span>
                  </div>
                </div>
              </div>

              {/* 디버그 row — 어떤 값이 끌려왔는지 확인용 */}
              <div className="px-4 py-2 text-[11px] text-ink-600 border-t border-border bg-bg-subtle/30 leading-relaxed font-mono">
                BOM 총원가: <b className="text-ink-900">{formatCurrency(apply.debug.bomTotalCost)}</b>
                {" · "}현재고: <b className="text-ink-900">{formatNumber(apply.debug.currentStock)}{r.item.unit}</b>
                {" · "}대략 1개 원가 (BOM/현재고): <b className="text-ink-900">{apply.debug.bomDividedByStock > 0 ? formatCurrency(apply.debug.bomDividedByStock) : "—"}</b>
                {" · "}적용 원가: <b className="text-ink-900">{apply.cost > 0 ? formatCurrency(apply.cost) : "—"}</b>
                {" · "}출처: <b className="text-ink-900">{apply.source}</b>
              </div>
              <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
                LOT가 있으면 LOT actualUnitCost 우선. LOT 없고 현재고가 있으면 BOM/현재고로 대략 원가. 둘 다 없으면 BOM 총원가 그대로.
                전체 재고 수량은 1개 원가 계산에 절대 곱하지 않습니다.
              </div>
            </div>

            {/* C. 향료 원가 분리 (item 단위) */}
            <div className="panel mb-4">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={14} className="text-ink-500" /> C. 향료 원가 분리
                <span className="ml-2 text-[11px] font-normal text-ink-500">
                  품목생산투입원료(우선) / 품목BOM(fallback)에서 향료/일반 분리 · 출처: <b className="text-ink-700">{fragranceBreakdown.source}</b>
                </span>
              </div>
              <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-md border border-border bg-bg-subtle/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">일반 원재료 원가</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">
                    {fragranceBreakdown.generalCost > 0
                      ? formatCurrency(fragranceBreakdown.generalCost)
                      : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">향료 제외 원료 합계</div>
                </div>
                <div className="rounded-md border-2 border-pink-300 bg-pink-50 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-pink-800">향료 원가</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-pink-800">
                    {fragranceBreakdown.fragranceCost > 0
                      ? formatCurrency(fragranceBreakdown.fragranceCost)
                      : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-pink-700 mt-0.5">향료 카테고리 원료 합계</div>
                </div>
                <div className="rounded-md border border-ink-300 bg-white p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">총 원가</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">
                    {fragranceBreakdown.totalCost > 0
                      ? formatCurrency(fragranceBreakdown.totalCost)
                      : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">일반 + 향료</div>
                </div>
                <div className="rounded-md border-2 border-pink-400 bg-pink-100/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-pink-800">향료 비중</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-pink-800">
                    {fragranceBreakdown.totalCost > 0
                      ? `${fragranceBreakdown.fragranceShare.toFixed(1)}%`
                      : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-pink-700 mt-0.5">향료 / 총 원가</div>
                </div>
              </div>
              <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
                향료 판별 필드: <code>category === &quot;향료&quot;</code> / <code>materialType === &quot;향료&quot;</code> / <code>materialGroup === &quot;fragrance&quot;</code> / <code>type === &quot;fragrance&quot;</code>.
                최근 완료 LOT 투입원료가 있으면 그 기준으로, 없으면 품목BOM × 원료단가 기준으로 분리.
              </div>
            </div>

            {/* D. 현재 재고 금액 */}
            <div className="panel mb-4">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Calculator size={14} className="text-ink-500" /> D. 현재 재고 금액
                <span className="ml-2 text-[11px] font-normal text-ink-500">현재고 × 적용 원가 · 1개 원가와 별개</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-border bg-bg-subtle/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">현재고</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {formatNumber(stock)} <span className="text-xs text-ink-500">{r.item.unit}</span>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-bg-subtle/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">적용 원가</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {apply.cost > 0 ? formatCurrency(apply.cost) : <span className="text-ink-400">—</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5">출처: {apply.source}</div>
                </div>
                <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3">
                  <div className="text-[10px] uppercase tracking-wider opacity-80">현재 재고 금액</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {stockValue > 0 ? formatCurrency(stockValue) : "—"}
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">= {formatNumber(stock)} × {apply.cost > 0 ? formatCurrency(apply.cost) : "—"}</div>
                </div>
              </div>
            </div>

            {/* D. LOT 원가 이력 */}
            <div className="panel mb-4">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Sparkles size={14} className="text-ink-500" /> E. LOT 원가 이력
                <span className="ml-2 text-[11px] font-normal text-ink-500">
                  이 품목의 생산 LOT만 표시 · 삭제됨 제외
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>LOT 번호</TH>
                      <TH>생산일</TH>
                      <TH className="text-right">실제 생산수량</TH>
                      <TH className="text-right">총 투입원가</TH>
                      <TH className="text-right">실제 1개 원가</TH>
                      <TH>상태</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {lotHistory.length === 0 ? <Empty>이 품목의 생산 LOT이 없습니다.</Empty> :
                      lotHistory.map((l) => {
                        const qty = l.actualProducedQty ?? l.completedQty ?? 0;
                        const totalCost = (l.actualMaterialTotalCost && l.actualMaterialTotalCost > 0)
                          ? l.actualMaterialTotalCost
                          : executionMaterials
                              .filter((e) => (l.lotCode && e.lotNo === l.lotCode) || (e.lotId && e.lotId === l.id))
                              .reduce((s, x) => s + (x.materialCost > 0 ? x.materialCost : x.actualQty * (x.unitCost > 0 ? x.unitCost : 0)), 0);
                        const unitCost = (l.actualUnitCost && l.actualUnitCost > 0)
                          ? l.actualUnitCost
                          : (qty > 0 && totalCost > 0 ? totalCost / qty : 0);
                        const statusChip =
                          l.status === "완료" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                          l.status === "테스트" ? "bg-purple-50 text-purple-800 border-purple-200" :
                          l.status === "폐기" ? "bg-red-50 text-red-800 border-red-300 font-semibold" :
                          "bg-bg-subtle text-ink-700 border-border";
                        return (
                          <TR key={l.id}>
                            <TD className="font-mono text-xs">{l.lotCode}</TD>
                            <TD className="font-mono text-xs">{l.date ? formatDateKst(l.date) : <span className="text-ink-400">—</span>}</TD>
                            <TD className="text-right tabular-nums">{qty > 0 ? formatNumber(qty) : <span className="text-ink-400">—</span>}</TD>
                            <TD className="text-right tabular-nums">{totalCost > 0 ? formatCurrency(totalCost) : <span className="text-ink-400">—</span>}</TD>
                            <TD className="text-right tabular-nums font-semibold">{unitCost > 0 ? formatCurrency(unitCost) : <span className="text-ink-400">—</span>}</TD>
                            <TD>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusChip}`}>
                                {l.status || "(미지정)"}
                              </span>
                            </TD>
                          </TR>
                        );
                      })
                    }
                  </TBody>
                </Table>
              </div>
              <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
                1개 실제 원가 = LOT.actualUnitCost → (LOT.actualMaterialTotalCost 또는 품목생산투입원료 합) ÷ 생산수량.
                테스트 / 폐기 LOT도 표시되지만 위 가중평균에서는 제외됩니다.
              </div>
            </div>
          </>
        );
      })()}

      {/* ─── 판매가 · 수수료 계산기 (품목 원가 조회 하단 추가 카드) ──
          세트 상품 기준 원가 자동 연동 (개별 색상 제외). 저장 없음. */}
      <SalesMarginCalculator setOptions={setOptions} setBom={setBom} itemActualRows={itemActualRows} />

      {/* ─── 세트 원가 계산기 (중복 — 상단 SetBomDisplayPanel 로 통합)
          기존 SimpleSetCalculator 는 hidden. 모든 세트 원가 계산은
          상단 "조립 BOM (세트 BOM) 계산기" 패널에서 수행됩니다. */}
      <div style={{ display: "none" }} aria-hidden>
        <SimpleSetCalculator
          setOptions={setOptions}
          setComposition={setComposition}
          setBom={setBom}
          itemActualRows={itemActualRows}
          items={items}
        />
      </div>

      {/* ─── (legacy) 상세 패널 자리 — 아래 옛 컨테이너는 비어 있어 닫기만 합니다. ─── */}
      <div style={{ display: "none" }}>
        <div className="panel mb-4">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Tag size={14} className="text-ink-500" /> A. 품목 1개 원가
          </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>품목번호</TH>
                <TH>품목명</TH>
                <TH className="text-right">현재고</TH>
                <TH className="text-right">BOM 1개 원가</TH>
                <TH className="text-right">최근 LOT 1개 원가</TH>
                <TH className="text-right">적용 원가</TH>
                <TH>적용 출처</TH>
              </TR>
            </THead>
            <TBody>
              {itemActualRows.length === 0 ? <Empty>품목이 없습니다.</Empty> :
                itemActualRows.map((r) => {
                  // Priority: 최근 LOT actualUnitCost → 가중평균 → BOM 1개 원가
                  const apply =
                    r.latestLotCost > 0 ? { cost: r.latestLotCost, src: "최근 LOT" } :
                    r.weightedAverageCost > 0 ? { cost: r.weightedAverageCost, src: "가중평균" } :
                    r.bomPerUnit > 0 ? { cost: r.bomPerUnit, src: "BOM" } :
                    { cost: 0, src: "원가 없음" };
                  const chip =
                    apply.src === "최근 LOT" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    apply.src === "가중평균" ? "bg-sky-50 text-sky-800 border-sky-200" :
                    apply.src === "BOM" ? "bg-amber-50 text-amber-800 border-amber-200" :
                    "bg-bg-subtle text-ink-500 border-border";
                  return (
                    <TR key={r.item.itemNo}>
                      <TD className="font-mono text-xs">{r.item.itemNo}</TD>
                      <TD>
                        <div className="font-medium">{r.item.colorName}</div>
                        <div className="text-[11px] text-ink-500">{r.item.productType}</div>
                      </TD>
                      <TD className="text-right tabular-nums text-ink-700">
                        {formatNumber(r.item.stock)} <span className="text-[10px] text-ink-500">{r.item.unit}</span>
                      </TD>
                      <TD className="text-right tabular-nums">{r.bomPerUnit > 0 ? formatCurrency(r.bomPerUnit) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums">{r.latestLotCost > 0 ? formatCurrency(r.latestLotCost) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums font-semibold">{apply.cost > 0 ? formatCurrency(apply.cost) : <span className="text-ink-400">—</span>}</TD>
                      <TD>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chip}`}>{apply.src}</span>
                      </TD>
                    </TR>
                  );
                })
              }
            </TBody>
          </Table>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
          BOM 1개 원가 = Σ(품목BOM.소요량 × 원료 단가). 전체 재고 수량은 절대 곱하지 않습니다.
          LOT가 없는 품목도 BOM 기준으로 1개 원가가 잡힙니다. 테스트 / 폐기 / 삭제됨 LOT은 평균에서 제외됩니다.
        </div>
      </div>

      {/* ─── B. 현재 재고 금액 ─────────────────────────────
          현재 재고 금액 = 현재고 × 적용 원가.
          1개 원가와 완전히 분리된 결과입니다. 세트 원가 계산에는 사용되지 않습니다. */}
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Calculator size={14} className="text-ink-500" /> B. 현재 재고 금액
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            현재고 × 적용 원가 · 세트 원가와 무관한 별도 집계
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>품목번호</TH>
                <TH>품목명</TH>
                <TH className="text-right">현재고</TH>
                <TH className="text-right">적용 원가</TH>
                <TH className="text-right">현재 재고 금액</TH>
              </TR>
            </THead>
            <TBody>
              {itemActualRows.length === 0 ? <Empty>품목이 없습니다.</Empty> : (() => {
                const rows = itemActualRows.map((r) => {
                  const applyCost =
                    r.latestLotCost > 0 ? r.latestLotCost :
                    r.weightedAverageCost > 0 ? r.weightedAverageCost :
                    r.bomPerUnit > 0 ? r.bomPerUnit : 0;
                  const stock = Number(r.item.stock) || 0;
                  return { ...r, applyCost, stockValue: stock * applyCost };
                });
                const grandTotal = rows.reduce((s, x) => s + x.stockValue, 0);
                return (
                  <>
                    {rows.map((r) => (
                      <TR key={r.item.itemNo}>
                        <TD className="font-mono text-xs">{r.item.itemNo}</TD>
                        <TD>
                          <div className="font-medium">{r.item.colorName}</div>
                          <div className="text-[11px] text-ink-500">{r.item.productType}</div>
                        </TD>
                        <TD className="text-right tabular-nums">
                          {formatNumber(r.item.stock)} <span className="text-[10px] text-ink-500">{r.item.unit}</span>
                        </TD>
                        <TD className="text-right tabular-nums">{r.applyCost > 0 ? formatCurrency(r.applyCost) : <span className="text-ink-400">—</span>}</TD>
                        <TD className="text-right tabular-nums font-semibold">{r.stockValue > 0 ? formatCurrency(r.stockValue) : <span className="text-ink-400">—</span>}</TD>
                      </TR>
                    ))}
                    <TR>
                      <TD className="text-right font-semibold bg-bg-subtle/40">총 재고 금액</TD>
                      <TD className="bg-bg-subtle/40">—</TD>
                      <TD className="bg-bg-subtle/40">—</TD>
                      <TD className="bg-bg-subtle/40">—</TD>
                      <TD className="text-right tabular-nums font-bold bg-bg-subtle/40">{formatCurrency(grandTotal)}</TD>
                    </TR>
                  </>
                );
              })()}
            </TBody>
          </Table>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
          이 표는 재고자산 금액 추정용입니다. 세트 원가 계산기와는 계산식이 분리되어 있습니다.
        </div>
      </div>

      {/* ─── C. 세트 원가 계산기 (간단 모드) ─────────────── */}
      <SimpleSetCalculator
        setOptions={setOptions}
        setComposition={setComposition}
        setBom={setBom}
        itemActualRows={itemActualRows}
        items={items}
      />

      {/* ─── (참고) 생산 LOT 실제 원가 ────────────────────── */}
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={14} className="text-ink-500" /> (참고) 생산 LOT 실제 원가
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            품목생산LOT + 품목생산투입원료 원본 · 위 A 섹션의 "최근 LOT" 출처 데이터
          </span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>LOT 번호</TH>
                <TH>품목번호</TH>
                <TH>품목명</TH>
                <TH>생산일</TH>
                <TH className="text-right">실제 생산수량</TH>
                <TH className="text-right">총 투입원가</TH>
                <TH className="text-right">1개 실제 원가</TH>
                <TH>상태</TH>
              </TR>
            </THead>
            <TBody>
              {(() => {
                const sorted = itemLots
                  .slice()
                  .filter((l) => l.status !== "삭제됨")
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                if (sorted.length === 0) {
                  return <Empty>생산 LOT이 없습니다.</Empty>;
                }
                return sorted.map((l) => {
                  const it = items.find((i) => i.itemNo === l.itemNo);
                  const qty = l.actualProducedQty ?? l.completedQty ?? 0;
                  const totalCost =
                    (l.actualMaterialTotalCost && l.actualMaterialTotalCost > 0)
                      ? l.actualMaterialTotalCost
                      : executionMaterials
                          .filter((e) => (l.lotCode && e.lotNo === l.lotCode) || (e.lotId && e.lotId === l.id))
                          .reduce((s, r) => s + (r.materialCost > 0 ? r.materialCost : r.actualQty * (r.unitCost > 0 ? r.unitCost : 0)), 0);
                  const unitCost =
                    (l.actualUnitCost && l.actualUnitCost > 0)
                      ? l.actualUnitCost
                      : (qty > 0 && totalCost > 0 ? totalCost / qty : 0);
                  const statusChip =
                    l.status === "완료" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : l.status === "테스트" ? "bg-purple-50 text-purple-800 border-purple-200"
                    : l.status === "폐기" ? "bg-red-50 text-red-800 border-red-300 font-semibold"
                    : "bg-bg-subtle text-ink-700 border-border";
                  return (
                    <TR key={l.id}>
                      <TD className="font-mono text-xs">{l.lotCode}</TD>
                      <TD className="font-mono text-xs">{l.itemNo}</TD>
                      <TD>
                        <div className="font-medium">{it?.colorName ?? "—"}</div>
                        <div className="text-[11px] text-ink-500">{l.productType}</div>
                      </TD>
                      <TD className="font-mono text-xs">{l.date ? formatDateKst(l.date) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums">{qty > 0 ? formatNumber(qty) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums">{totalCost > 0 ? formatCurrency(totalCost) : <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums font-semibold">{unitCost > 0 ? formatCurrency(unitCost) : <span className="text-ink-400">—</span>}</TD>
                      <TD>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusChip}`}>
                          {l.status || "(미지정)"}
                        </span>
                      </TD>
                    </TR>
                  );
                });
              })()}
            </TBody>
          </Table>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
          1개 실제 원가 = LOT.actualUnitCost → (LOT.actualMaterialTotalCost 또는 품목생산투입원료 합) ÷ 생산수량.
          테스트 / 폐기 LOT도 표시되지만 A 섹션 가중평균에서는 제외됩니다.
        </div>
      </div>
      </div>{/* end legacy display:none wrapper */}

      {/* ─── F-LOT 향 생산 원가 — 원가계산 화면에서 숨김 ────
          향 LOT 관리표는 향료 관리 페이지로 분리 예정. 데이터는 계속
          fetch되지만 UI에는 노출하지 않음. */}
      <div style={{ display: "none" }} aria-hidden>
      <div className="panel mb-4">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={14} className="text-ink-500" /> 향 생산 원가 (F-LOT)
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            향생산LOT + 향생산투입원료 기반 자동 계산 · 완료 LOT만 평균 집계
          </span>
        </div>
        <div className="px-4 py-2 grid grid-cols-2 lg:grid-cols-6 gap-2 text-[11px] border-b border-border bg-bg-subtle/30">
          <div>완료 LOT <b className="text-ink-900 ml-1">{fragranceAgg.completedCount}건</b></div>
          <div>총 생산량 <b className="text-ink-900 ml-1 tabular-nums">{formatNumber(fragranceAgg.totalQty)}ml</b></div>
          <div>총 일반 원재료 <b className="text-ink-900 ml-1 tabular-nums">{formatCurrency(fragranceAgg.totalNormal)}</b></div>
          <div>총 향료 <b className="text-ink-900 ml-1 tabular-nums">{formatCurrency(fragranceAgg.totalFragrance)}</b></div>
          <div>총 원가 <b className="text-ink-900 ml-1 tabular-nums">{formatCurrency(fragranceAgg.totalCost)}</b></div>
          <div>평균 단위 원가 <b className="text-ink-900 ml-1 tabular-nums">{formatCurrency(fragranceAgg.averageUnitCost)}/ml</b></div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>LOT</TH><TH>향 코드 / 이름</TH>
                <TH>생산일</TH><TH>담당자</TH><TH>상태</TH>
                <TH>배합일</TH><TH>시향일</TH>
                <TH className="text-right">생산량 (ml)</TH>
                <TH className="text-right">일반 원재료</TH>
                <TH className="text-right">향료</TH>
                <TH className="text-right">총 원가</TH>
                <TH className="text-right">단위 원가</TH>
              </TR>
            </THead>
            <TBody>
              {fragranceRows.length === 0 ? <Empty>등록된 향 LOT이 없습니다.</Empty> :
                fragranceRows.map((r) => (
                  <TR key={r.lot.id}>
                    <TD className="font-mono text-xs">{r.lot.lotNo}</TD>
                    <TD>
                      <div className="font-mono text-xs">{r.lot.fragranceCode}</div>
                      <div className="font-medium">{r.lot.fragranceName}</div>
                    </TD>
                    <TD className="font-mono text-xs">{r.lot.productionDate ? formatDateKst(r.lot.productionDate) : <span className="text-ink-400">—</span>}</TD>
                    <TD>{r.lot.worker || <span className="text-ink-400">(미지정)</span>}</TD>
                    <TD>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        r.status === "완료" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                        r.status === "테스트" ? "bg-purple-50 text-purple-800 border-purple-200" :
                        r.status === "폐기" ? "bg-red-50 text-red-800 border-red-300 font-semibold" :
                        "bg-bg-subtle text-ink-700 border-border"
                      }`}>{r.status}</span>
                    </TD>
                    <TD className="font-mono text-xs">{r.lot.mixingDate ? formatDateKst(r.lot.mixingDate) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="font-mono text-xs">{r.lot.scentTestDate ? formatDateKst(r.lot.scentTestDate) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(r.lot.actualProducedQty)}</TD>
                    <TD className="text-right tabular-nums">{r.normalCost > 0 ? formatCurrency(r.normalCost) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums">{r.fragranceCost > 0 ? formatCurrency(r.fragranceCost) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums font-medium">{r.total > 0 ? formatCurrency(r.total) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums font-semibold">{r.unitCost > 0 ? formatCurrency(r.unitCost) : <span className="text-ink-400">—</span>}/ml</TD>
                  </TR>
                ))
              }
            </TBody>
          </Table>
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
          향료 분류 기준: 원료재고 category === &quot;향료&quot;. 평균 단위 원가 = 완료 LOT 총 원가 / 완료 LOT 총 생산량.
          테스트 / 폐기 / 미지정 LOT은 평균 집계에서 제외됩니다.
        </div>
      </div>
      </div>{/* end F-LOT display:none wrapper */}

      {/* ─── 임시 비활성화 amber notice — 화면에서 제거 (display:none) ─── */}
      <div style={{ display: "none" }} aria-hidden>
      {/* ─── 임시 비활성화: 품목별 자동 원가 + 세트별 자동 원가 ───
          기존 계산식이 인건비 매칭과 단가 fallback 누락으로 잘못 표시되어
          숨김 처리합니다. 정확한 1개 원가는 위의 "BOM 기준 품목 1개
          표준원가" + "생산 LOT별 실제 원가" 섹션에서 확인하세요. */}
      <div className="panel mb-4 border-dashed border-amber-200 bg-amber-50/30">
        <div className="px-4 py-3 text-[12px] text-amber-900">
          <div className="font-semibold mb-1">⏸ 기존 "품목별 자동 원가" · "세트별 자동 원가" 섹션이 임시 비활성화되어 있습니다.</div>
          <div className="text-[11px] leading-relaxed">
            이전 계산식이 인건비/단가 fallback 누락으로 부정확한 값을 보여 임시로 숨겼습니다.
            정확한 원가는 위의 <b>BOM 기준 품목 1개 표준원가</b> + <b>생산 LOT별 실제 원가</b> 섹션에서 자동 계산됩니다.
            세트 원가는 아래 <b>세트 원가 계산기</b>에서 구성품 1개씩 기준으로 계산하세요.
          </div>
        </div>
      </div>
      </div>{/* end amber notice display:none wrapper */}

      {/* ─── Legacy tail (hidden) ────────────────────────────
          Per-set itemized breakdown + 원가 항목 (수동 설정) 등 generic
          accounting 구조를 simplification 요청에 따라 숨김 처리합니다. */}
      <div style={{ display: "none" }} aria-hidden>
      {/* ─── Per-set itemized breakdown (collapsible) ───── */}
      <div className="panel mt-4">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Calculator size={14} className="text-ink-500" /> 세트 원가 상세
        </div>
        <div className="p-3 space-y-4">
          {setCosts.map((sc) => (
            <details key={sc.option.id} className="border border-border rounded-lg bg-bg-subtle/30">
              <summary className="px-3 py-2 cursor-pointer flex items-center justify-between text-sm">
                <div>
                  <b>{sc.option.productType} {sc.option.setSize} · {sc.option.optionName}</b>
                  <span className="text-ink-500 ml-2 font-mono text-xs">{sc.option.optionCode}</span>
                </div>
                <span className="tabular-nums font-semibold">{formatCurrency(sc.perSet)}</span>
              </summary>
              <div className="px-3 pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-th">품목</th>
                      <th className="table-th text-right">단가</th>
                      <th className="table-th text-right">수량</th>
                      <th className="table-th text-right">소계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sc.itemBreakdown.map((b) => (
                      <tr key={b.itemNo}>
                        <td className="table-td">
                          <span className="font-mono text-xs text-ink-700 mr-2">{b.itemNo}</span>
                          {b.colorName}
                        </td>
                        <td className="table-td text-right tabular-nums">{formatCurrency(b.unitCost)}</td>
                        <td className="table-td text-right tabular-nums">×{b.qty}</td>
                        <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(b.lineTotal)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="table-td text-ink-600">조립</td>
                      <td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(sc.assembly)}</td>
                    </tr>
                    <tr>
                      <td className="table-td text-ink-600">패키지</td>
                      <td className="table-td"></td><td className="table-td"></td>
                      <td className="table-td text-right tabular-nums">{formatCurrency(sc.packaging)}</td>
                    </tr>
                    <tr className="bg-bg-subtle">
                      <td className="table-td font-semibold" colSpan={3}>1세트 원가 합계</td>
                      <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(sc.perSet)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* ─── Cost item registry ──────────────────────────── */}
      <div className="mt-4">
        <SaveErrorPanel error={saveError} onClose={clearError}
          onRetry={() => retrySave()} retrying={savingCost} />
      </div>
      <div className="panel">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Calculator size={14} className="text-ink-500" /> 원가 항목 (수동 설정)
          <span className="text-xs font-normal text-ink-500 ml-2">
            품목 인건비, 세트 조립비, 패키지비, 수수료 등
          </span>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>항목명</TH>
              <TH className="text-right">금액</TH>
              <TH>단위</TH>
              <TH>적용기준</TH>
              <TH>비고</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {newItem && costRow(newItem, true)}
            {costList.length === 0 && !newItem ? <Empty>원가 항목이 없습니다.</Empty> :
              costList.map((c) => costRow(drafts[c.id] ?? c))}
          </TBody>
        </Table>
      </div>
      </div>
    </div>
  );
}

// ─── SimpleSetCalculator (조립 BOM 계산기) ─────────────────
// 데이터 소스: 세트BOM 시트.
// 시트 헤더: id / setCode / setName / componentType / componentCode /
//   componentName / qty / unitCost / unitCostSource / note / createdAt / updatedAt
//
// 계산식: 소계 = qty × 1개 단가
//         세트 총 원가 = Σ(소계) + 패키지비
//
// 1개 단가:
//   componentType="item"     → getAppliedUnitCost(componentCode)
//                              (최근 LOT → 가중평균 → BOM/현재고 → BOM 참고)
//   componentType="package" / "option" / "material"
//                            → 시트의 unitCost
//
// CRITICAL — 전체 재고 수량은 절대 곱하지 않음.
//   ✗ currentStock × unitCost   ✗ actualMaterialTotalCost   ✗ totalCost
//
// 세트BOM이 비어 있으면 setComposition fallback (색상 × 1).
type TempComponent = {
  key: string;
  componentType: SetBomComponentType;
  componentCode: string;
  componentName: string;
  qty: number;
  unitCost: number;
  unitCostSource: string;
};
function SimpleSetCalculator({
  setOptions, setComposition, setBom, itemActualRows, items,
}: {
  setOptions: SetOption[];
  setComposition: SetComposition[];
  setBom: SetBomLine[];
  itemActualRows: Array<{
    item: Item;
    bomPerUnit: number;
    completedLotCount: number;
    totalProducedQty: number;
    totalActualCost: number;
    weightedAverageCost: number;
    latestLot: ItemLot | null;
    latestLotCost: number;
    latestLotQty: number;
    applied: AppliedUnitCostResult;
  }>;
  items: Item[];
}) {
  // ── 세트 picker 옵션 — setBom에 등록된 distinct setCode 우선,
  //    없으면 setOptions (legacy) 사용.
  const bomSetOptions = useMemo(() => {
    const map = new Map<string, { setCode: string; setName: string }>();
    for (const b of setBom) {
      if (!b.setCode) continue;
      const cur = map.get(b.setCode);
      if (!cur) map.set(b.setCode, { setCode: b.setCode, setName: b.setName || b.setCode });
      else if (!cur.setName && b.setName) cur.setName = b.setName;
    }
    return Array.from(map.values()).sort((a, b) => a.setCode.localeCompare(b.setCode));
  }, [setBom]);
  // Legacy fallback picker options (use SetOption.optionCode as setCode).
  const legacySetOptions = useMemo(() => {
    return setOptions.map((o) => ({
      setCode: o.optionCode || o.id,
      setName: `${o.productType} ${o.setSize} ${o.optionName}`,
    }));
  }, [setOptions]);
  const pickerOptions = bomSetOptions.length > 0 ? bomSetOptions : legacySetOptions;
  // "ALL" sentinel selects every setCode in setBom (전체 보기).
  const ALL = "__ALL__";
  const [selectedSetCode, setSelectedSetCode] = useState<string>(
    pickerOptions[0]?.setCode ?? "",
  );
  const isAll = selectedSetCode === ALL;
  const [packagingCost, setPackagingCost] = useState<number>(0);
  const [tempComponents, setTempComponents] = useState<TempComponent[]>([]);

  const selectedSet = isAll
    ? { setCode: ALL, setName: "전체" }
    : pickerOptions.find((p) => p.setCode === selectedSetCode);

  // ① 세트BOM 매칭 (setCode 기준, 또는 전체)
  const bomLines: SetBomLine[] = useMemo(
    () => isAll ? setBom : setBom.filter((b) => b.setCode === selectedSetCode),
    [setBom, selectedSetCode, isAll],
  );
  const usingBom = bomLines.length > 0;

  type BreakdownRow = {
    key: string;
    source: "세트BOM" | "구성품목" | "임시";
    setCode: string;
    setName: string;
    componentType: SetBomComponentType;
    componentCode: string;
    componentName: string;
    qty: number;
    unitCost: number;
    appliedSource: string;
    subtotal: number;
    debug?: AppliedUnitCostResult["debug"];
  };

  // ② setBom 행 → breakdown 행
  const bomBreakdown: BreakdownRow[] = bomLines.map((b, idx) => {
    let unitCost = 0;
    let appliedSource = b.unitCostSource || "세트BOM 단가";
    let debug: AppliedUnitCostResult["debug"] | undefined;
    if (b.componentType === "item") {
      const row = itemActualRows.find((r) => r.item.itemNo === b.componentCode);
      const applied = row?.applied;
      unitCost = applied?.cost ?? 0;
      appliedSource = applied?.source ?? "원가 없음";
      debug = applied?.debug;
    } else {
      unitCost = b.unitCost || 0;
      if (!appliedSource) appliedSource = unitCost > 0 ? "세트BOM 단가" : "단가 없음";
    }
    const qty = b.qty || 1;
    return {
      key: b.id || `bom-${idx}`,
      source: "세트BOM",
      setCode: b.setCode,
      setName: b.setName || b.setCode,
      componentType: b.componentType,
      componentCode: b.componentCode,
      componentName: b.componentName
        || items.find((i) => i.itemNo === b.componentCode)?.colorName
        || "(이름 없음)",
      qty,
      unitCost,
      appliedSource,
      subtotal: unitCost * qty,
      debug,
    };
  });

  // ③ Fallback: setBom 미등록 시 setComposition 기반 (색상 × 1)
  //    setComposition은 setOption.id 기준이므로 selectedSetCode를 optionCode로 보고 매칭.
  const fallbackOption = setOptions.find((o) => o.optionCode === selectedSetCode);
  const fallbackBreakdown: BreakdownRow[] = usingBom ? [] :
    (fallbackOption ? setComposition
      .filter((c) => c.setOptionId === fallbackOption.id)
      .map((c, idx) => {
        const row = itemActualRows.find((r) => r.item.itemNo === c.itemNo);
        const applied = row?.applied;
        return {
          key: c.id || `comp-${idx}`,
          source: "구성품목",
          setCode: fallbackOption.optionCode,
          setName: `${fallbackOption.productType} ${fallbackOption.setSize} ${fallbackOption.optionName}`,
          componentType: "item" as const,
          componentCode: c.itemNo,
          componentName: items.find((i) => i.itemNo === c.itemNo)?.colorName ?? "(없음)",
          qty: 1,
          unitCost: applied?.cost ?? 0,
          appliedSource: applied?.source ?? "원가 없음",
          subtotal: applied?.cost ?? 0,
          debug: applied?.debug,
        };
      }) : []);

  // ④ 임시 추가 구성품
  const tempBreakdown: BreakdownRow[] = tempComponents.map((t) => {
    let unitCost = t.unitCost || 0;
    let appliedSource = t.unitCostSource || "직접 입력";
    let debug: AppliedUnitCostResult["debug"] | undefined;
    if (t.componentType === "item" && t.componentCode) {
      const row = itemActualRows.find((r) => r.item.itemNo === t.componentCode);
      const applied = row?.applied;
      if (applied) {
        unitCost = applied.cost;
        appliedSource = applied.source;
        debug = applied.debug;
      }
    }
    return {
      key: t.key,
      source: "임시" as const,
      setCode: isAll ? "" : (selectedSet?.setCode ?? ""),
      setName: isAll ? "" : (selectedSet?.setName ?? ""),
      componentType: t.componentType,
      componentCode: t.componentCode,
      componentName: t.componentName,
      qty: t.qty || 1,
      unitCost,
      appliedSource,
      subtotal: (t.qty || 1) * unitCost,
      debug,
    };
  });

  const breakdown = [...bomBreakdown, ...fallbackBreakdown, ...tempBreakdown];
  const itemTotal = breakdown.reduce((s, b) => s + b.subtotal, 0);
  const total = itemTotal + (packagingCost || 0);

  function addTempComponent() {
    setTempComponents((arr) => [
      ...arr,
      {
        key: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        componentType: "option",
        componentCode: "",
        componentName: "",
        qty: 1,
        unitCost: 0,
        unitCostSource: "",
      },
    ]);
  }
  function updateTempComponent(key: string, patch: Partial<TempComponent>) {
    setTempComponents((arr) => arr.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }
  function removeTempComponent(key: string) {
    setTempComponents((arr) => arr.filter((t) => t.key !== key));
  }

  return (
    <div className="panel mb-4">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <Layers size={14} className="text-ink-500" /> 조립 BOM (세트 BOM)
        <span className="ml-2 text-[11px] font-normal text-ink-500">
          세트BOM 시트 기반 · 소계 = qty × 1개 단가 · 세트 총 원가 = Σ(소계) + 패키지비
        </span>
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded border ${
          setBom.length > 0
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-amber-50 text-amber-800 border-amber-200"
        }`}>
          세트BOM 행 {setBom.length}개
          {setBom.length > 0 && ` · 세트 ${bomSetOptions.length}종`}
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label">세트 선택 ({pickerOptions.length}개)</label>
          <select className="input" value={selectedSetCode}
            onChange={(e) => setSelectedSetCode(e.target.value)}>
            {pickerOptions.length === 0 && <option value="">(세트 없음 — 세트BOM 시트에 행을 추가하세요)</option>}
            {pickerOptions.length > 0 && <option value={ALL}>전체 보기 ({pickerOptions.length}개 세트)</option>}
            {pickerOptions.map((p) => (
              <option key={p.setCode} value={p.setCode}>
                [{p.setCode}] {p.setName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">패키지 원가 (원)</label>
          <input className="input text-right tabular-nums" type="number" min={0}
            value={packagingCost}
            onChange={(e) => setPackagingCost(Number(e.target.value) || 0)} />
        </div>
        <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-80">세트 총 원가</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums">{formatCurrency(total)}</div>
          </div>
          <div className="text-[10px] opacity-80 text-right leading-tight">
            구성품 {breakdown.length}종<br />
            품목합 {formatCurrency(itemTotal)}<br />
            + 패키지 {formatCurrency(packagingCost || 0)}
          </div>
        </div>
      </div>
      {!selectedSet ? (
        <div className="mx-4 mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          세트를 선택하세요. <b>세트BOM</b> 시트가 비어 있으면 picker도 비어 있습니다.
          (헤더: id / setCode / setName / componentType / componentCode / componentName / qty / unitCost / unitCostSource / note / createdAt / updatedAt)
        </div>
      ) : (
        <>
          <div className="px-4 py-2 text-[11px] flex items-center justify-between border-t border-border bg-bg-subtle/30">
            <div className="text-ink-600">
              {usingBom ? (
                <>
                  <span className="text-emerald-700 font-semibold">세트BOM 사용 중</span>
                  {" — "}[{selectedSet.setCode}] {selectedSet.setName} 의 BOM {bomLines.length}개 구성품 합산.
                </>
              ) : (
                <>
                  <span className="text-amber-700 font-semibold">세트BOM 미등록</span>
                  {" — "}세트구성품목 (색상 × 1) fallback 모드. <b>세트BOM</b> 시트에 setCode={selectedSetCode} 행을 추가하면 자동 전환.
                </>
              )}
            </div>
            <button className="btn-ghost text-xs" onClick={addTempComponent}>
              + 임시 구성품 추가
            </button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>세트코드</TH>
                  <TH>세트명</TH>
                  <TH>구성유형</TH>
                  <TH>구성코드</TH>
                  <TH>구성명</TH>
                  <TH className="text-right">수량</TH>
                  <TH className="text-right">단가</TH>
                  <TH>단가 출처</TH>
                  <TH className="text-right">디버그</TH>
                  <TH className="text-right">소계</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {breakdown.length === 0 ? <Empty>이 세트 옵션의 구성품이 없습니다. 세트BOM에 행을 추가하거나 임시 구성품을 추가하세요.</Empty> :
                  breakdown.map((b) => {
                    const typeChip =
                      b.componentType === "item"     ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                      b.componentType === "package"  ? "bg-purple-50 text-purple-800 border-purple-200" :
                      b.componentType === "option"   ? "bg-sky-50 text-sky-800 border-sky-200" :
                      b.componentType === "material" ? "bg-amber-50 text-amber-800 border-amber-200" :
                      "bg-bg-subtle text-ink-700 border-border";
                    const sourceChip =
                      b.appliedSource === "최근 LOT"   ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                      b.appliedSource === "가중평균"   ? "bg-sky-50 text-sky-800 border-sky-200" :
                      b.appliedSource === "BOM/현재고" ? "bg-amber-50 text-amber-800 border-amber-200" :
                      b.appliedSource === "BOM 참고"   ? "bg-orange-50 text-orange-800 border-orange-200" :
                      b.appliedSource === "세트BOM 단가" ? "bg-violet-50 text-violet-800 border-violet-200" :
                      b.appliedSource === "직접 입력"  ? "bg-bg-subtle text-ink-700 border-border" :
                      "bg-bg-subtle text-ink-500 border-border";
                    const isTemp = b.source === "임시";
                    const temp = isTemp ? tempComponents.find((t) => t.key === b.key) : undefined;
                    return (
                      <TR key={b.key}>
                        <TD className="font-mono text-xs">{b.setCode || <span className="text-ink-400">—</span>}</TD>
                        <TD className="text-xs">{b.setName || <span className="text-ink-400">—</span>}</TD>
                        <TD>
                          {isTemp && temp ? (
                            <select className="input h-7 text-xs" value={temp.componentType}
                              onChange={(e) => updateTempComponent(temp.key, { componentType: e.target.value as SetBomComponentType })}>
                              <option value="option">option</option>
                              <option value="package">package</option>
                              <option value="material">material</option>
                              <option value="item">item</option>
                            </select>
                          ) : (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeChip}`}>{b.componentType}</span>
                          )}
                        </TD>
                        <TD>
                          {isTemp && temp ? (
                            <input className="input h-7 text-xs font-mono w-24" value={temp.componentCode}
                              placeholder="코드"
                              onChange={(e) => updateTempComponent(temp.key, { componentCode: e.target.value })} />
                          ) : (
                            <span className="font-mono text-xs">{b.componentCode || <span className="text-ink-400">—</span>}</span>
                          )}
                        </TD>
                        <TD>
                          {isTemp && temp ? (
                            <input className="input h-7 text-xs w-40" value={temp.componentName}
                              placeholder="구성명"
                              onChange={(e) => updateTempComponent(temp.key, { componentName: e.target.value })} />
                          ) : (
                            b.componentName
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {isTemp && temp ? (
                            <input className="input h-7 text-xs text-right tabular-nums w-16" type="number" min={0}
                              value={temp.qty}
                              onChange={(e) => updateTempComponent(temp.key, { qty: Number(e.target.value) || 0 })} />
                          ) : (
                            `×${b.qty}`
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {isTemp && temp && temp.componentType !== "item" ? (
                            <input className="input h-7 text-xs text-right tabular-nums w-24" type="number" min={0}
                              value={temp.unitCost}
                              onChange={(e) => updateTempComponent(temp.key, { unitCost: Number(e.target.value) || 0 })} />
                          ) : (
                            b.unitCost > 0 ? formatCurrency(b.unitCost) : <span className="text-ink-400">—</span>
                          )}
                        </TD>
                        <TD>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sourceChip}`}>{b.appliedSource}</span>
                        </TD>
                        <TD className="text-right text-[10px] text-ink-500 font-mono whitespace-nowrap">
                          {b.debug
                            ? (<>
                                BOM {b.debug.bomTotalCost > 0 ? formatCurrency(b.debug.bomTotalCost) : "—"}
                                {" / "}재고 {b.debug.currentStock > 0 ? formatNumber(b.debug.currentStock) : "0"}
                                {" / "}최근LOT {b.debug.latestLotCost > 0 ? formatCurrency(b.debug.latestLotCost) : "—"}
                              </>)
                            : "—"}
                        </TD>
                        <TD className="text-right tabular-nums font-semibold">{b.subtotal > 0 ? formatCurrency(b.subtotal) : <span className="text-ink-400">—</span>}</TD>
                        <TD>
                          {isTemp && (
                            <button className="text-xs text-red-600 hover:underline"
                              onClick={() => removeTempComponent(b.key)}>
                              삭제
                            </button>
                          )}
                        </TD>
                      </TR>
                    );
                  })
                }
              </TBody>
            </Table>
          </div>
        </>
      )}
      <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
        <b>세트BOM 시트가 있으면</b> 그 행을 기준으로 모든 구성품(색상 + 패키지 + 옵션)을 합산합니다.
        item 타입은 적용 1개 원가 (최근 LOT → 가중평균 → BOM/현재고 → BOM 참고), 그 외 타입은 세트BOM 단가 사용.
        세트BOM이 없으면 세트구성품목 (색상 × 1) fallback. <b>임시 구성품</b>은 즉석 추가용 (시트에 저장되지 않음).
        세트 계산기는 <b>오직 1개 단가 × 구성수량</b>만 사용 — 재고 금액·LOT 총원가는 절대 곱하지 않습니다.
      </div>
    </div>
  );
}

// ─── SetBomDisplayPanel (실제 세트 계산기) ──────────────────
// 세트BOM 시트의 모든 구성품을 picker로 선택한 세트 기준으로 합산.
//
//   componentType="item"     → getAppliedUnitCost(componentCode)
//                              (최근 LOT → 가중평균 → BOM/현재고 → BOM 참고)
//   componentType="package" / "option" / "material"
//                            → 시트의 unitCost
//
// 소계 = appliedUnitCost × qty
// 세트 총 원가 = Σ(소계)
function SetBomDisplayPanel({
  setBom, itemActualRows,
}: {
  setBom: SetBomLine[];
  itemActualRows: Array<{ item: Item; applied: AppliedUnitCostResult }>;
}) {
  const distinctSets = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of setBom) {
      if (!b.setCode) continue;
      if (!m.has(b.setCode)) m.set(b.setCode, b.setName || b.setCode);
      else if (b.setName && m.get(b.setCode) === b.setCode) m.set(b.setCode, b.setName);
    }
    return Array.from(m.entries()).map(([setCode, setName]) => ({ setCode, setName }))
      .sort((a, b) => a.setCode.localeCompare(b.setCode));
  }, [setBom]);
  // 첫 setCode 가 있으면 그것을, 없으면 빈 문자열.
  const [selectedSetCode, setSelectedSetCode] = useState<string>(
    distinctSets[0]?.setCode ?? "",
  );

  // 각 행의 적용 1개 원가 계산
  type ComputedRow = SetBomLine & {
    appliedUnitCost: number;
    appliedSource: string;
    subtotal: number;
  };
  const computed: ComputedRow[] = useMemo(() => {
    const filtered = selectedSetCode === ""
      ? setBom
      : setBom.filter((b) => b.setCode === selectedSetCode);
    return filtered.map((b) => {
      let appliedUnitCost = 0;
      let appliedSource = b.unitCostSource || "";
      if (b.componentType === "item") {
        const row = itemActualRows.find((r) => r.item.itemNo === b.componentCode);
        if (row) {
          appliedUnitCost = row.applied.cost;
          appliedSource = row.applied.source;
        } else {
          appliedSource = "원가 없음";
        }
      } else {
        appliedUnitCost = b.unitCost || 0;
        if (!appliedSource) appliedSource = appliedUnitCost > 0 ? "세트BOM 단가" : "단가 없음";
      }
      const subtotal = appliedUnitCost * (b.qty || 0);
      return { ...b, appliedUnitCost, appliedSource, subtotal };
    });
  }, [setBom, selectedSetCode, itemActualRows]);

  const setTotal = computed.reduce((s, r) => s + r.subtotal, 0);
  const selectedSetName = distinctSets.find((s) => s.setCode === selectedSetCode)?.setName ?? "";

  return (
    <div className="panel mb-4">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <Layers size={14} className="text-ink-500" /> 조립 BOM (세트 BOM) 계산기
        <span className="ml-2 text-[11px] font-normal text-ink-500">
          소계 = qty × 적용 단가 · 세트 총 원가 = Σ(소계)
        </span>
        <span className={`ml-auto text-[11px] px-2 py-0.5 rounded border ${
          setBom.length > 0
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-amber-50 text-amber-800 border-amber-200"
        }`}>
          세트BOM {setBom.length}행 · {distinctSets.length}종
        </span>
      </div>

      {setBom.length === 0 ? (
        <div className="px-4 py-6 text-sm">
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded p-3">
            <div className="font-semibold mb-1">세트BOM 데이터 없음</div>
            <div className="text-[12px] leading-relaxed">
              <code className="bg-white px-1 rounded">세트BOM</code> 시트에서 0행을 받았습니다.
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li>시트 이름이 정확히 <b>세트BOM</b> 인지 (앞뒤 공백·한영 혼합 확인)</li>
                <li>1행 헤더가 <code>id, setCode, setName, componentType, componentCode, componentName, qty, unitCost, unitCostSource, note, createdAt, updatedAt</code> 인지</li>
                <li>2행부터 실제 데이터가 있는지</li>
                <li>진단: <code>/api/set-bom</code> 호출하면 raw fetch 결과 JSON 반환</li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 세트 선택 + 총 원가 패널 */}
          <div className="px-4 py-3 border-b border-border grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <label className="label">세트 선택</label>
              <select className="input" value={selectedSetCode}
                onChange={(e) => setSelectedSetCode(e.target.value)}>
                <option value="">전체 보기 ({setBom.length}행, {distinctSets.length}종)</option>
                {distinctSets.map((s) => (
                  <option key={s.setCode} value={s.setCode}>
                    [{s.setCode}] {s.setName}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3 min-w-[220px]">
              <div className="text-[10px] uppercase tracking-wider opacity-80">
                {selectedSetCode ? `${selectedSetCode} 세트 총 원가` : "전체 합계"}
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums">{formatCurrency(setTotal)}</div>
              <div className="text-[10px] opacity-80 mt-0.5">
                구성품 {computed.length}행
                {selectedSetCode && selectedSetName ? ` · ${selectedSetName}` : ""}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>세트코드</TH>
                  <TH>세트명</TH>
                  <TH>구성유형</TH>
                  <TH>구성코드</TH>
                  <TH>구성명</TH>
                  <TH className="text-right">수량</TH>
                  <TH className="text-right">적용 단가</TH>
                  <TH>원가 출처</TH>
                  <TH className="text-right">소계</TH>
                </TR>
              </THead>
              <TBody>
                {computed.length === 0 ? (
                  <Empty>선택한 세트의 구성품이 없습니다.</Empty>
                ) : computed.map((b) => {
                  const typeChip =
                    b.componentType === "item"     ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    b.componentType === "package"  ? "bg-purple-50 text-purple-800 border-purple-200" :
                    b.componentType === "option"   ? "bg-sky-50 text-sky-800 border-sky-200" :
                    b.componentType === "material" ? "bg-amber-50 text-amber-800 border-amber-200" :
                    "bg-bg-subtle text-ink-700 border-border";
                  const sourceChip =
                    b.appliedSource === "최근 LOT"     ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                    b.appliedSource === "가중평균"     ? "bg-sky-50 text-sky-800 border-sky-200" :
                    b.appliedSource === "BOM/현재고"   ? "bg-amber-50 text-amber-800 border-amber-200" :
                    b.appliedSource === "BOM 참고"     ? "bg-orange-50 text-orange-800 border-orange-200" :
                    b.appliedSource === "세트BOM 단가" ? "bg-violet-50 text-violet-800 border-violet-200" :
                    "bg-bg-subtle text-ink-500 border-border";
                  return (
                    <TR key={b.id || `${b.setCode}-${b.componentCode}`}>
                      <TD className="font-mono text-xs">{b.setCode}</TD>
                      <TD className="text-xs">{b.setName || <span className="text-ink-400">—</span>}</TD>
                      <TD>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeChip}`}>{b.componentType}</span>
                      </TD>
                      <TD className="font-mono text-xs">{b.componentCode || <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-xs">{b.componentName || <span className="text-ink-400">—</span>}</TD>
                      <TD className="text-right tabular-nums">×{b.qty}</TD>
                      <TD className="text-right tabular-nums">{b.appliedUnitCost > 0 ? formatCurrency(b.appliedUnitCost) : <span className="text-ink-400">—</span>}</TD>
                      <TD>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sourceChip}`}>{b.appliedSource}</span>
                      </TD>
                      <TD className="text-right tabular-nums font-semibold">{b.subtotal > 0 ? formatCurrency(b.subtotal) : <span className="text-ink-400">—</span>}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border leading-relaxed">
            item 타입은 적용 1개 원가 (최근 LOT → 가중평균 → BOM/현재고 → BOM 참고), 그 외 타입은 세트BOM의 unitCost 사용.
            전체 재고 수량은 절대 곱하지 않습니다.
          </div>
        </>
      )}
    </div>
  );
}

// ─── SalesMarginCalculator ──────────────────────────────────
// 판매가·수수료 계산기. 저장 없음 — 순수 계산.
//
// 품목 picker는 "세트 상품"만 표시 (개별 색상 제외). 세트 후보 소스:
//   세트BOM 시트의 distinct setCode → 거기 잡힌 세트만 picker에 노출.
// 선택 시 세트 원가(= Σ 구성품 적용단가 × qty)가 자동으로 원가 필드에
// 들어가지만, 사용자가 수동 수정 가능.
//
// 계산식:
//   수수료           = salesPrice × feeRate/100
//   실입금액         = salesPrice − 수수료
//   총비용           = 원가 + 배송비 + 포장비 + 기타비용
//   남는 금액        = 실입금액 − 총비용
//   마진율           = 남는 금액 / salesPrice × 100
//   실입금 기준 마진율 = 남는 금액 / 실입금액 × 100
function SalesMarginCalculator({
  setOptions, setBom, itemActualRows,
}: {
  setOptions: SetOption[];
  setBom: SetBomLine[];
  itemActualRows: Array<{
    item: Item;
    applied: AppliedUnitCostResult;
  }>;
}) {
  // 세트 상품 dropdown 소스 = 세트옵션 시트의 옵션.
  //   표시값 = optionName, 실제값 = optionCode.
  // 세트BOM 조회 / productType="세트" 검색 / 품목마스터 매칭 같은 추가 로직 없음.
  const setOptionsList = useMemo(() => {
    return setOptions
      .filter((o) => o.isActive !== false)
      .map((o) => ({ optionCode: o.optionCode, optionName: o.optionName }))
      .filter((o) => o.optionCode && o.optionName)
      .sort((a, b) => a.optionCode.localeCompare(b.optionCode));
  }, [setOptions]);

  // 선택된 옵션의 실제 값 = optionCode
  const [selectedOptionCode, setSelectedOptionCode] = useState<string>("");
  const [salesPrice, setSalesPrice] = useState<number>(25000);
  const [feeRate, setFeeRate] = useState<number>(30);
  const [cost, setCost] = useState<number>(0);
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [packagingCost, setPackagingCost] = useState<number>(0);
  const [otherCost, setOtherCost] = useState<number>(0);

  // 선택된 옵션의 원가 = Σ(세트BOM 구성품 적용 1개 원가 × qty).
  // 매칭: setBom.setCode === selectedOptionCode (옵션코드와 세트코드 동일 키).
  // 시트에 BOM 없으면 0 (사용자가 수동 입력).
  const selectedSetCost = useMemo(() => {
    if (!selectedOptionCode) return 0;
    const lines = setBom.filter((b) => b.setCode === selectedOptionCode);
    let total = 0;
    for (const b of lines) {
      let unit = 0;
      if (b.componentType === "item") {
        const row = itemActualRows.find((r) => r.item.itemNo === b.componentCode);
        unit = row?.applied.cost ?? 0;
      } else {
        unit = b.unitCost || 0;
      }
      total += unit * (b.qty || 0);
    }
    return total;
  }, [selectedOptionCode, setBom, itemActualRows]);

  const selectedOption = setOptionsList.find((s) => s.optionCode === selectedOptionCode);

  function applySetCost() {
    if (selectedSetCost > 0) setCost(Math.round(selectedSetCost));
  }

  // 옵션을 선택하는 순간 자동으로 원가 필드 채워주기.
  const lastAppliedOptionRef = useRef<string>("");
  useEffect(() => {
    if (selectedOptionCode && selectedOptionCode !== lastAppliedOptionRef.current && selectedSetCost > 0) {
      setCost(Math.round(selectedSetCost));
      lastAppliedOptionRef.current = selectedOptionCode;
    }
  }, [selectedOptionCode, selectedSetCost]);

  const fee = Math.round(salesPrice * (feeRate / 100));
  const netReceived = salesPrice - fee;
  const totalCost = cost + shippingCost + packagingCost + otherCost;
  const margin = netReceived - totalCost;
  const marginRateOnPrice = salesPrice > 0 ? (margin / salesPrice) * 100 : 0;
  const marginRateOnNet = netReceived > 0 ? (margin / netReceived) * 100 : 0;

  const presets = [20, 25, 30, 35, 38];

  return (
    <div className="panel mb-4">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
        <Calculator size={14} className="text-ink-500" /> 판매가 · 수수료 계산기
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* ── 입력 ── */}
        <div className="space-y-3">
          <div>
            <label className="label">세트 상품 선택</label>
            <div className="flex gap-2">
              <select className="input flex-1"
                value={selectedOptionCode}
                onChange={(e) => setSelectedOptionCode(e.target.value)}>
                <option value="">— 선택 안 함 —</option>
                {setOptionsList.length === 0 ? (
                  <option value="" disabled>등록된 세트 옵션이 없습니다</option>
                ) : (
                  setOptionsList.map((s) => (
                    <option key={s.optionCode} value={s.optionCode}>
                      {s.optionName}
                    </option>
                  ))
                )}
              </select>
              {selectedOptionCode && (
                <button className="btn-ghost text-xs whitespace-nowrap"
                  onClick={applySetCost} title="원가를 다시 채움">
                  원가 다시 채우기
                </button>
              )}
            </div>
            {selectedOption && (
              <div className="text-[11px] text-ink-500 mt-1">
                옵션코드: <b className="font-mono text-ink-700">{selectedOption.optionCode}</b>
                {selectedSetCost > 0 && (
                  <span className="ml-2">· 세트 원가 <b className="text-ink-900 tabular-nums">{formatCurrency(selectedSetCost)}</b></span>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="label">판매가 (원)</label>
            <input className="input text-right tabular-nums" type="number" min={0}
              value={salesPrice}
              onChange={(e) => setSalesPrice(Number(e.target.value) || 0)} />
          </div>

          <div>
            <label className="label flex items-center gap-2">
              수수료율 (%)
              <span className="ml-auto flex gap-1">
                {presets.map((p) => (
                  <button key={p} type="button"
                    className={`text-[11px] px-1.5 py-0.5 rounded border tabular-nums ${
                      feeRate === p
                        ? "bg-ink-900 text-bg border-ink-900"
                        : "bg-bg-subtle text-ink-700 border-border hover:bg-bg"
                    }`}
                    onClick={() => setFeeRate(p)}>
                    {p}%
                  </button>
                ))}
              </span>
            </label>
            <input className="input text-right tabular-nums" type="number" min={0} max={100} step={0.1}
              value={feeRate}
              onChange={(e) => setFeeRate(Number(e.target.value) || 0)} />
          </div>

          <div>
            <label className="label">원가 (원)</label>
            <input className="input text-right tabular-nums" type="number" min={0}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value) || 0)} />
          </div>
        </div>

        {/* ── 결과 — 남는 금액 + 마진율만 ── */}
        <div className="space-y-3">
          <div className={`rounded-md border-2 p-4 ${
            margin > 0 ? "border-emerald-500 bg-emerald-50/60"
            : margin === 0 ? "border-ink-900 bg-bg-subtle"
            : "border-red-500 bg-red-50/60"
          }`}>
            <div className="text-[10px] uppercase tracking-wider opacity-80">남는 금액</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${
              margin > 0 ? "text-emerald-700" : margin === 0 ? "text-ink-900" : "text-red-700"
            }`}>
              {formatCurrency(margin)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-white/60 border border-border px-2 py-1.5">
                <div className="text-[10px] text-ink-500">마진율 (판매가 기준)</div>
                <div className="tabular-nums font-semibold text-ink-900 mt-0.5">
                  {salesPrice > 0 ? marginRateOnPrice.toFixed(1) : "—"}%
                </div>
              </div>
              <div className="rounded bg-white/60 border border-border px-2 py-1.5">
                <div className="text-[10px] text-ink-500">마진율 (실입금 기준)</div>
                <div className="tabular-nums font-semibold text-ink-900 mt-0.5">
                  {netReceived > 0 ? marginRateOnNet.toFixed(1) : "—"}%
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
