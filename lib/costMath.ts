import type {
  CostCalculation,
  CostItem,
  Item,
  ItemBomLine,
  ItemLot,
  Material,
  ProductionExecutionMaterial,
  SetComposition,
  SetOption,
} from "@/types";

/**
 * Resolve a material's effective unit cost with a tolerant fallback chain.
 * Picks the first positive value from:
 *   unitCost → unitPrice → purchaseUnitCost → price → lastPurchasePrice → 0
 *
 * Field names beyond unitCost / unitPrice are read-only and only present
 * when the 원료재고 sheet has those extra columns populated.
 */
export function resolveMaterialUnitCost(m: Material | null | undefined): number {
  if (!m) return 0;
  const candidates: Array<number | undefined> = [
    m.unitCost, m.unitPrice, m.purchaseUnitCost, m.price, m.lastPurchasePrice,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  // None positive — return 0 explicitly (callers may treat this as "no price").
  return 0;
}

/** Tolerant production-quantity resolver:
 *   actualProducedQty → completedQty → targetQty → 0
 *  Used by aggregation/weighted-average so legacy LOTs without
 *  actualProducedQty still contribute. */
export function resolveLotProducedQty(l: ItemLot | null | undefined): number {
  if (!l) return 0;
  const candidates: Array<number | undefined> = [
    l.actualProducedQty, l.completedQty, l.targetQty,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

/**
 * Pure material cost (per 1 unit) for a given itemNo:
 *   sum(BOM.qty × material.unitCost)
 *
 * Matches by either materialId or materialCode so legacy BOM rows
 * (which fill materialId but not materialCode) still resolve.
 */
export function materialCostForItemNo(
  itemNo: string,
  bom: ItemBomLine[],
  materials: Material[],
): { perUnit: number; lines: Array<{ line: ItemBomLine; material: Material | null; subtotal: number }> } {
  const lines = bom.filter((b) => b.itemNo === itemNo);
  let perUnit = 0;
  const detailed = lines.map((line) => {
    const material = materials.find(
      (m) =>
        m.id === line.materialId ||
        (line.materialCode && (m.materialCode === line.materialCode || m.id === line.materialCode)),
    ) ?? null;
    const unitCost = resolveMaterialUnitCost(material);
    const subtotal = line.amountPerUnit * unitCost;
    perUnit += subtotal;
    return { line, material, subtotal };
  });
  return { perUnit, lines: detailed };
}

/**
 * Cost breakdown for one itemNo — literal user spec.
 *
 *   재료비 = sum(BOM.qty × material.unitCost)
 *   총 생산 원가 = 재료비 + 총 인건비 + 포장비 + 제조간접비
 *   제품 1개 원가 = 총 생산 원가 / 생산수량
 *   불량률 적용 시:
 *     제품 1개 원가 = 총 생산 원가 / (생산수량 × (1 − defectRate/100))
 *
 * Notes:
 *   - The four addends in 총 생산 원가 are summed directly, exactly as the
 *     user enters them. Material is NOT multiplied by 생산수량.
 *   - The exact 생산수량 input is the divisor (with defect adjustment).
 *   - Returns qtyValid=false when 생산수량 ≤ 0 so the UI can warn instead
 *     of rendering NaN.
 *   - defectRatePercent is clamped to [0, 99.9].
 */
export function computeItemCostBreakdown(args: {
  itemNo: string;
  bom: ItemBomLine[];
  materials: Material[];
  expectedQty: number;
  laborTotal: number;
  packagingTotal: number;
  overheadTotal: number;
  defectRatePercent: number;
}) {
  const qtyRaw = Math.floor(args.expectedQty || 0);
  const qtyValid = qtyRaw > 0;
  const qty = qtyValid ? qtyRaw : 0;

  const { perUnit: materialSubtotal, lines } = materialCostForItemNo(
    args.itemNo,
    args.bom,
    args.materials,
  );
  const laborTotal = args.laborTotal || 0;
  const packagingTotal = args.packagingTotal || 0;
  const overheadTotal = args.overheadTotal || 0;

  // 총 생산 원가 — direct sum, NO qty multiplier on material.
  const totalProductionCost =
    materialSubtotal + laborTotal + packagingTotal + overheadTotal;

  const rate = Math.max(0, Math.min(99.9, args.defectRatePercent || 0));
  const defectFactor = 1 - rate / 100;
  // Effective good-unit count after defects.
  const effectiveQty = qtyValid ? qty * defectFactor : 0;

  // 제품 1개 원가 = 총 생산 원가 / (생산수량 × (1 − defect/100)).
  const finalUnitCost = effectiveQty > 0 ? totalProductionCost / effectiveQty : 0;
  // 불량 반영 전 per-unit cost (= total / qty).
  const unitBeforeDefect = qtyValid ? totalProductionCost / qty : 0;

  // Per-unit component slices for the detail table. Each component is divided
  // by the same effective divisor so they add up to finalUnitCost.
  const divisor = effectiveQty > 0 ? effectiveQty : 1;
  const materialPerUnit = qtyValid ? materialSubtotal / divisor : 0;
  const laborPerUnit = qtyValid ? laborTotal / divisor : 0;
  const packagingPerUnit = qtyValid ? packagingTotal / divisor : 0;
  const overheadPerUnit = qtyValid ? overheadTotal / divisor : 0;

  return {
    qtyValid,
    defectRate: rate,
    // Inputs echoed back for the breakdown table.
    materialSubtotal,
    laborTotal,
    packagingTotal,
    overheadTotal,
    // Headline numbers.
    totalProductionCost,
    finalUnitCost,
    unitBeforeDefect,
    // Per-unit breakdown (each includes defect adjustment so they sum to finalUnitCost).
    materialPerUnit,
    laborPerUnit,
    packagingPerUnit,
    overheadPerUnit,
    lines,
    // Legacy aliases — keep prior callers compiling without surprise.
    materialCost: materialSubtotal,
    baseCost: unitBeforeDefect,
    defectAdjusted: finalUnitCost,
    materialBatch: materialSubtotal,
    batchTotal: totalProductionCost,
    finalBatchCost: totalProductionCost,
  };
}

export type ItemUnitCostSource = "saved" | "actual" | "bom" | "missing";

/**
 * Aggregate actual production cost across ALL 완료 LOTs for one itemNo.
 *
 *   completedLotCount    = count of itemLots where status="완료"
 *   totalProducedQty     = Σ resolveLotProducedQty(lot)
 *   totalActualCost      = Σ per-lot material cost, where per-lot is:
 *                            1) Σ executionMaterials.materialCost (snapshot)  [preferred]
 *                            2) lot.actualMaterialTotalCost                    [fallback]
 *                            3) materialCostForItemNo(itemNo) × producedQty    [fallback]
 *   weightedAverageCost  = totalActualCost / totalProducedQty
 *   latestLot            = most recent 완료 LOT by date (and createdAt tiebreak)
 *
 * Status filter is strictly the Korean "완료" — 폐기 / 테스트 / 삭제됨 /
 * 예정 / 보류 / 진행중 LOTs are excluded from the average.
 */
export function aggregateActualCostByItem(
  itemNo: string,
  itemLots: ItemLot[],
  executionMaterials: ProductionExecutionMaterial[],
  materials: Material[],
  bom: ItemBomLine[],
): {
  completedLotCount: number;
  totalProducedQty: number;
  totalActualCost: number;
  weightedAverageCost: number;
  latestLot: ItemLot | null;
  latestLotCost: number;
  latestLotQty: number;
} {
  const needle = String(itemNo ?? "").trim();
  if (!needle) {
    return {
      completedLotCount: 0, totalProducedQty: 0, totalActualCost: 0,
      weightedAverageCost: 0, latestLot: null, latestLotCost: 0, latestLotQty: 0,
    };
  }
  const completedLots = itemLots.filter(
    (l) => String(l.itemNo ?? "").trim() === needle && l.status === "완료",
  );
  let totalProducedQty = 0;
  let totalActualCost  = 0;
  const bomPerUnit = materialCostForItemNo(needle, bom, materials).perUnit;
  for (const lot of completedLots) {
    const qty = resolveLotProducedQty(lot);
    if (qty <= 0) continue;
    totalProducedQty += qty;
    // Per-lot material cost via priority chain.
    // 1) Sum exec.materialCost (or fallback to actualQty × current unitCost per row).
    const execRows = executionMaterials.filter(
      (m) =>
        String(m.itemNo).trim() === needle &&
        ((lot.lotCode && m.lotNo === lot.lotCode) || (m.lotId && m.lotId === lot.id)),
    );
    let perLotCost = 0;
    if (execRows.length > 0) {
      perLotCost = execRows.reduce((s, r) => {
        if (r.materialCost > 0) return s + r.materialCost;
        const mat = materials.find(
          (x) =>
            (r.materialCode && (x.materialCode === r.materialCode || x.id === r.materialCode)) ||
            x.id === r.materialCode,
        );
        const uc = r.unitCost > 0 ? r.unitCost : resolveMaterialUnitCost(mat ?? null);
        return s + r.actualQty * uc;
      }, 0);
    }
    if (perLotCost <= 0 && lot.actualMaterialTotalCost && lot.actualMaterialTotalCost > 0) {
      perLotCost = lot.actualMaterialTotalCost;
    }
    if (perLotCost <= 0 && bomPerUnit > 0) {
      perLotCost = bomPerUnit * qty;
    }
    totalActualCost += perLotCost;
  }
  const sortedCompleted = completedLots.slice().sort((a, b) => {
    const ad = (a.date || "");
    const bd = (b.date || "");
    if (ad !== bd) return bd.localeCompare(ad);
    return 0;
  });
  const latestLot = sortedCompleted[0] ?? null;
  const latestLotQty = latestLot ? resolveLotProducedQty(latestLot) : 0;
  const latestLotCost = latestLot
    ? (latestLot.actualUnitCost && latestLot.actualUnitCost > 0
        ? latestLot.actualUnitCost
        : (latestLotQty > 0 && latestLot.actualMaterialTotalCost
            ? latestLot.actualMaterialTotalCost / latestLotQty
            : 0))
    : 0;
  return {
    completedLotCount: completedLots.length,
    totalProducedQty,
    totalActualCost,
    weightedAverageCost: totalProducedQty > 0 ? totalActualCost / totalProducedQty : 0,
    latestLot,
    latestLotCost,
    latestLotQty,
  };
}

// ─── 4-tier 적용 1개 원가 (applied unit cost) ────────────────────
// 적용 1개 원가는 반드시 "1개당" 가격입니다. 절대 총액(actualMaterialTotalCost,
// currentStock × unitCost, inventoryValue, totalCost, LOT 총투입원가)을
// 반환하지 않습니다. 세트 계산기는 이 함수의 cost 만 사용해야 합니다.
export type AppliedUnitCostSource =
  | "최근 LOT"        // 1순위 — 최근 완료 LOT actualUnitCost
  | "가중평균"        // 2순위 — 완료 LOT actualUnitCost 가중평균
  | "BOM/현재고"     // 3순위 — BOM 총원가 ÷ 현재고 (대략 1개 원가)
  | "BOM 참고"        // 4순위 — 현재고=0 이거나 stock-divide 불가 시 BOM 총원가 그대로
  | "원가 없음";      // 모든 단계 0

export interface AppliedUnitCostDebug {
  latestLotCost: number;        // 1순위 후보 (per-piece)
  weightedAverageCost: number;  // 2순위 후보 (per-piece)
  bomTotalCost: number;         // BOM Σ(소요량 × 원료 단가)
  currentStock: number;         // 품목 현재고 (분모 + 표시용)
  bomDividedByStock: number;    // 3순위 후보 = bomTotalCost / currentStock
  completedLotCount: number;
}

export interface AppliedUnitCostResult {
  cost: number;                       // 적용 1개 원가
  source: AppliedUnitCostSource;
  debug: AppliedUnitCostDebug;
}

/**
 * 미리 집계된 값에서 적용 1개 원가를 골라내는 순수 함수.
 *
 *   1) latestLotCost     > 0  → "최근 LOT"
 *   2) weightedAverage   > 0  → "가중평균"
 *   3) bomTotal/stock    > 0  → "BOM/현재고"   (현재고가 0이면 건너뜀)
 *   4) bomTotal          > 0  → "BOM 참고"
 *   5) 그 외                  → "원가 없음" (cost = 0)
 *
 * 모든 후보값은 반드시 "1개당" 단위여야 합니다.
 */
export function pickAppliedUnitCost(args: {
  latestLotCost: number;
  weightedAverageCost: number;
  bomTotalCost: number;
  currentStock: number;
  completedLotCount?: number;
}): AppliedUnitCostResult {
  const latestLotCost       = args.latestLotCost       > 0 ? args.latestLotCost       : 0;
  const weightedAverageCost = args.weightedAverageCost > 0 ? args.weightedAverageCost : 0;
  const bomTotalCost        = args.bomTotalCost        > 0 ? args.bomTotalCost        : 0;
  const currentStock        = args.currentStock        > 0 ? args.currentStock        : 0;
  const bomDividedByStock = currentStock > 0 && bomTotalCost > 0
    ? bomTotalCost / currentStock
    : 0;
  const debug: AppliedUnitCostDebug = {
    latestLotCost, weightedAverageCost, bomTotalCost,
    currentStock, bomDividedByStock,
    completedLotCount: args.completedLotCount ?? 0,
  };
  if (latestLotCost       > 0) return { cost: latestLotCost,       source: "최근 LOT",   debug };
  if (weightedAverageCost > 0) return { cost: weightedAverageCost, source: "가중평균",   debug };
  if (bomDividedByStock   > 0) return { cost: bomDividedByStock,   source: "BOM/현재고", debug };
  if (bomTotalCost        > 0) return { cost: bomTotalCost,        source: "BOM 참고",    debug };
  return { cost: 0, source: "원가 없음", debug };
}

/**
 * 단일 itemNo의 적용 1개 원가를 풀-페치합니다 (BOM + LOT 집계 포함).
 * 호출이 잦은 경우 (예: 카탈로그 전체 매핑) pickAppliedUnitCost로 직접
 * 미리 집계한 값을 넘기는 것이 비용상 유리합니다.
 */
export function getAppliedUnitCost(args: {
  itemNo: string;
  bom: ItemBomLine[];
  materials: Material[];
  itemLots: ItemLot[];
  executionMaterials: ProductionExecutionMaterial[];
  currentStock: number;
}): AppliedUnitCostResult {
  const agg = aggregateActualCostByItem(
    args.itemNo, args.itemLots, args.executionMaterials, args.materials, args.bom,
  );
  const bomTotalCost = materialCostForItemNo(args.itemNo, args.bom, args.materials).perUnit;
  return pickAppliedUnitCost({
    latestLotCost: agg.latestLotCost,
    weightedAverageCost: agg.weightedAverageCost,
    bomTotalCost,
    currentStock: args.currentStock,
    completedLotCount: agg.completedLotCount,
  });
}

/**
 * Compute the actual per-unit item cost from production execution data.
 *
 *   actual material total cost = sum(execution.actualQty × material.unitCost)
 *   actual item unit cost      = actual material total cost / actualProducedQty
 *
 * Picks the latest lot for the itemNo that has both:
 *   - actualProducedQty > 0
 *   - at least one matching ProductionExecutionMaterial row
 *
 * Returns null when no usable execution data exists for this itemNo.
 */
export function computeActualItemUnitCost(
  itemNo: string,
  itemLots: ItemLot[],
  executionMaterials: ProductionExecutionMaterial[],
  materials: Material[],
): { unitCost: number; lot: ItemLot; rows: ProductionExecutionMaterial[]; totalMaterialCost: number } | null {
  const needle = String(itemNo).trim();
  if (!needle) return null;
  // Newest first.
  // Strict Korean "완료" filter — never "completed"/"done". Other statuses
  // (테스트, 진행중, 폐기, 삭제됨, 보류, 예정) are excluded from actual-cost.
  const candidateLots = itemLots
    .filter((l) => String(l.itemNo).trim() === needle && l.status === "완료" && resolveLotProducedQty(l) > 0)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  for (const lot of candidateLots) {
    // Canonical link key per the schema spec: lotNo + itemNo.
    // (lotId is preserved on the in-memory type for back-compat with rows
    // written before the strict schema landed.)
    const rows = executionMaterials.filter(
      (m) =>
        String(m.itemNo).trim() === needle &&
        ((lot.lotCode && m.lotNo === lot.lotCode) || (m.lotId && m.lotId === lot.id)),
    );
    if (rows.length === 0) continue;
    // Prefer the persisted materialCost (snapshot at execution time); fall back
    // to actualQty × current material.unitCost if the snapshot is missing.
    const totalMaterialCost = rows.reduce((s, r) => {
      if (r.materialCost > 0) return s + r.materialCost;
      const mat = materials.find(
        (x) =>
          (r.materialCode && (x.materialCode === r.materialCode || x.id === r.materialCode)) ||
          x.id === r.materialCode,
      );
      const unitCost = r.unitCost > 0 ? r.unitCost : resolveMaterialUnitCost(mat ?? null);
      return s + r.actualQty * unitCost;
    }, 0);
    const qty = resolveLotProducedQty(lot);
    if (qty <= 0) continue;
    // If the LOT already persisted actualUnitCost, use that (saved snapshot
    // wins over re-derivation — historical reproducibility).
    if (lot.actualUnitCost && lot.actualUnitCost > 0) {
      return { unitCost: lot.actualUnitCost, lot, rows, totalMaterialCost };
    }
    return { unitCost: totalMaterialCost / qty, lot, rows, totalMaterialCost };
  }
  return null;
}

/**
 * Look up the unit cost of one itemNo for set-cost calculations.
 *
 * Priority chain (productionUnit is NEVER used):
 *   1. saved   → latest 원가계산 row with targetType="품목" → totalCost.
 *   2. actual  → latest production LOT's actualUnitCost (snapshot) or
 *                sum(actualQty × unitCost) / actualProducedQty.
 *   3. bom     → sum(BOM.qty × material.unitCost) treated as per-piece.
 *   4. missing → 0.
 *
 * Matching rules:
 *   - String(itemNo) matches BOTH c.itemNo AND c.targetCode (stringified).
 *   - targetType accepts "품목" or legacy "item".
 *   - A saved row WINS regardless of totalCost; never falls through to BOM
 *     once a saved entry exists.
 */
export function getItemUnitCost(
  itemNo: string,
  calculations: CostCalculation[],
  bom: ItemBomLine[],
  materials: Material[],
  items?: Item[],
  itemLots?: ItemLot[],
  executionMaterials?: ProductionExecutionMaterial[],
): {
  unitCost: number;
  source: ItemUnitCostSource;
  saved: CostCalculation | null;
  actualLot?: ItemLot;
  divisor?: number;
} {
  const needle = String(itemNo ?? "").trim();
  if (!needle) return { unitCost: 0, source: "missing", saved: null };

  // Tier 1: saved 원가계산 row.
  const isItemType = (t: unknown) => t === "품목" || t === "item";
  const matches = calculations
    .filter((c) => {
      if (!isItemType(c.targetType as unknown)) return false;
      const a = String(c.itemNo ?? "").trim();
      const b = String(c.targetCode ?? "").trim();
      return a === needle || b === needle;
    })
    .sort((a, b) => (b.calculatedAt || "").localeCompare(a.calculatedAt || ""));
  if (matches[0]) {
    return { unitCost: matches[0].totalCost, source: "saved", saved: matches[0] };
  }

  // Tier 2: latest production execution actual cost.
  if (itemLots && executionMaterials) {
    const actual = computeActualItemUnitCost(needle, itemLots, executionMaterials, materials);
    if (actual) {
      return { unitCost: actual.unitCost, source: "actual", saved: null, actualLot: actual.lot };
    }
  }

  // Tier 3: BOM per-piece estimate.
  // Per the latest spec, item.productionUnit is NO LONGER used for costing —
  // the source of truth is actual LOT data (tier 2). The BOM tier reads BOM
  // qty as per-piece (品목BOM 시트 정의: "1개당 사용량") and returns the sum
  // directly, with no divisor.
  void items;
  const perUnitFallback = materialCostForItemNo(needle, bom, materials).perUnit;
  if (perUnitFallback > 0) {
    return { unitCost: perUnitFallback, source: "bom", saved: null };
  }
  return { unitCost: 0, source: "missing", saved: null };
}

/**
 * 세트 1개 원가 =
 *   sum(구성품 itemNo의 제품 1개 원가 × 세트당 수량)
 *   + 세트 포장비 + 세트 포장 인건비 + 세트 제조간접비
 *
 * Component "제품 1개 원가" comes from getItemUnitCost — saved 원가계산 first,
 * BOM fallback otherwise. Each breakdown row carries the source label so the
 * UI can show whether the price is a saved snapshot or a temporary estimate.
 */
export function computeSetOptionCost(args: {
  setOption: SetOption;
  composition: SetComposition[];
  items: Item[];
  bom: ItemBomLine[];
  materials: Material[];
  calculations?: CostCalculation[];
  itemLots?: ItemLot[];
  executionMaterials?: ProductionExecutionMaterial[];
  setPackagingCost: number;
  setLaborCost?: number;
  setOverheadCost?: number;
}) {
  const lines = args.composition.filter((c) => c.setOptionId === args.setOption.id);
  const calcs = args.calculations ?? [];

  const breakdown = lines.map((l) => {
    const item = args.items.find((i) => i.itemNo === l.itemNo);
    const lookup = getItemUnitCost(
      l.itemNo, calcs, args.bom, args.materials, args.items,
      args.itemLots, args.executionMaterials,
    );
    const materialTotal = materialCostForItemNo(l.itemNo, args.bom, args.materials).perUnit;
    return {
      itemNo: l.itemNo,
      colorName: item?.colorName ?? "(없음)",
      qty: l.qty,
      perUnit: lookup.unitCost,
      source: lookup.source,
      saved: lookup.saved,
      savedTotalCost: lookup.saved?.totalCost ?? null,
      actualLot: lookup.actualLot ?? null,
      bomEstimate: materialTotal,
      subtotal: lookup.unitCost * l.qty,
    };
  });

  const itemTotal = breakdown.reduce((s, b) => s + b.subtotal, 0);
  const packaging = args.setPackagingCost || 0;
  const labor = args.setLaborCost || 0;
  const overhead = args.setOverheadCost || 0;
  const total = itemTotal + packaging + labor + overhead;
  const savedCount = breakdown.filter((b) => b.source === "saved").length;
  const actualCount = breakdown.filter((b) => b.source === "actual").length;
  const bomCount = breakdown.filter((b) => b.source === "bom").length;
  const missingCount = breakdown.filter((b) => b.source === "missing").length;

  return {
    breakdown,
    itemTotal,
    packaging,
    labor,
    overhead,
    total,
    savedCount,
    actualCount,
    bomCount,
    missingCount,
  };
}

/**
 * Per-item cost = sum(BOM line × material unit price) + labor cost from CostItems
 * (matched by product type, e.g. "오일파스텔 1개 인건비").
 *
 * Pure function — safe to import from client components.
 */
export function computeItemCost(args: {
  item: Item;
  bom: ItemBomLine[];
  materials: Material[];
  costItems: CostItem[];
}) {
  const lines = args.bom.filter((b) => b.itemNo === args.item.itemNo);
  let material = 0;
  for (const line of lines) {
    const m = args.materials.find((x) => x.id === line.materialId);
    if (!m) continue;
    // 단위당 단가(unitCost) 우선 — unitPrice 는 이제 구입단가이므로 직접 쓰지 않음.
    material += line.amountPerUnit * resolveMaterialUnitCost(m);
  }
  const laborItem = args.costItems.find(
    (c) => c.name.includes(args.item.productType) && c.basis.includes("품목 생산"),
  );
  const labor = laborItem?.amount ?? 0;
  const total = material + labor;
  return { material, labor, total, lines };
}

/**
 * Per-set cost = sum(per-item cost × qty in composition) + set-level assembly +
 * set-level packaging cost (matched by product type + set size).
 *
 * Returns { itemBreakdown, assembly, packaging, perSet, ... }.
 */
export function computeSetCost(args: {
  option: SetOption;
  composition: SetComposition[];
  items: Item[];
  bom: ItemBomLine[];
  materials: Material[];
  costItems: CostItem[];
}) {
  const lines = args.composition.filter((c) => c.setOptionId === args.option.id);

  const itemBreakdown = lines.map((l) => {
    const item = args.items.find((i) => i.itemNo === l.itemNo);
    if (!item) {
      return {
        itemNo: l.itemNo, colorName: "(없음)", qty: l.qty,
        unitCost: 0, lineTotal: 0,
      };
    }
    const ic = computeItemCost({ item, bom: args.bom, materials: args.materials, costItems: args.costItems });
    return {
      itemNo: item.itemNo,
      colorName: item.colorName,
      qty: l.qty,
      unitCost: ic.total,
      lineTotal: ic.total * l.qty,
    };
  });

  const itemTotal = itemBreakdown.reduce((s, l) => s + l.lineTotal, 0);

  const sig = `${args.option.productType} ${args.option.setSize}`;
  const assembly = args.costItems.find(
    (c) => c.basis.includes("세트") && c.name.includes(sig) && (c.name.includes("조립") || c.name.includes("인건")),
  )?.amount ?? 0;
  const packaging = args.costItems.find(
    (c) => c.basis.includes("세트") && c.name.includes(sig) && (c.name.includes("패키지") || c.name.includes("포장")),
  )?.amount ?? 0;

  const perSet = itemTotal + assembly + packaging;
  return { itemBreakdown, itemTotal, assembly, packaging, perSet };
}
