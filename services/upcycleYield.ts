import type { ItemLot, Material, ProductionExecutionMaterial } from "@/types";
import { listMaterials } from "./upcycleMaterials";
import { listItemLots } from "./upcycleProduction";
import { listExecutionMaterials } from "./upcycleProductionExecution";

// 폐화장품으로 보는 카테고리 (제공처 귀속 대상). 그 외(기타 첨가재료)는
// 제공처 인풋/수율 계산에서 제외한다.
const COSMETIC_CATEGORIES = new Set([
  "립스틱", "아이섀도우", "립글로스", "샴푸", "기타화장품",
]);

function isCosmetic(m: Material | undefined): boolean {
  if (!m) return false;
  if (m.contentWeightPerUnit != null || m.receivedUnits != null) return true;
  return COSMETIC_CATEGORIES.has(m.category);
}

export interface SupplierYieldRow {
  supplier: string;          // 제공처 (원료 공급처 칸)
  receivedUnits: number;     // 받은 총 개수
  contentWeightG: number;    // 내용물 총량(g) = Σ 받은개수 × 개당무게
  consumedG: number;         // 생산에 실제 투입된 내용물(g)
  outputUnits: number;       // 산출 개수 (LOT actualProducedQty 귀속분)
  // 수율
  yieldPerUnit: number | null;   // 산출개수 / 받은개수
  yieldPerKg: number | null;     // 산출개수 / (내용물 kg)
  materialCount: number;     // 이 제공처에서 받은 원료 종류 수
}

/**
 * 제공처별 인풋(받은 개수·내용물 g) 대비 아웃풋(산출 개수)을 집계한다.
 *
 *  - 인풋: 업사이클 원료재고에서 supplier(제공처)별로 receivedUnits 합,
 *    그리고 receivedUnits × contentWeightPerUnit 합(내용물 총 g).
 *  - 아웃풋: 각 LOT의 actualProducedQty를, 그 LOT이 소비한 "폐화장품" 원료의
 *    제공처별 투입 내용물(g) 비중으로 안분(allocate)해 귀속.
 *    (기타 첨가재료는 귀속에서 제외 — 제공처가 준 게 아니므로)
 */
export async function listSupplierYield(): Promise<SupplierYieldRow[]> {
  const [materials, lots, execs] = await Promise.all([
    listMaterials(), listItemLots(), listExecutionMaterials(),
  ]);

  // materialCode/id → Material (for supplier + cosmetic lookup)
  const matByKey = new Map<string, Material>();
  for (const m of materials) {
    if (m.materialCode) matByKey.set(m.materialCode, m);
    if (m.id) matByKey.set(m.id, m);
  }
  const resolveMat = (code: string) => matByKey.get(code);

  // ─── 인풋: 제공처별 받은 개수 / 내용물 총 g ───
  const agg = new Map<string, SupplierYieldRow>();
  const ensure = (supplier: string): SupplierYieldRow => {
    const key = supplier || "(미지정)";
    let row = agg.get(key);
    if (!row) {
      row = {
        supplier: key, receivedUnits: 0, contentWeightG: 0, consumedG: 0,
        outputUnits: 0, yieldPerUnit: null, yieldPerKg: null, materialCount: 0,
      };
      agg.set(key, row);
    }
    return row;
  };
  for (const m of materials) {
    if (!isCosmetic(m)) continue;
    const row = ensure(m.supplier);
    row.materialCount += 1;
    const units = m.receivedUnits ?? 0;
    row.receivedUnits += units;
    row.contentWeightG += units * (m.contentWeightPerUnit ?? 0);
  }

  // ─── 아웃풋: LOT 산출개수를 제공처별 투입 내용물(g) 비중으로 안분 ───
  const lotByCode = new Map<string, ItemLot>();
  for (const l of lots) {
    if (l.lotCode) lotByCode.set(l.lotCode, l);
  }
  // LOT별로 소비된 폐화장품을 제공처별 g로 모은다.
  const consumedByLot = new Map<string, Map<string, number>>(); // lotKey → (supplier → g)
  const lotKeyOf = (e: ProductionExecutionMaterial) => e.lotNo || e.lotId || "";
  for (const e of execs) {
    const m = resolveMat(e.materialCode);
    if (!isCosmetic(m)) continue;          // 기타 재료는 제공처 귀속 제외
    const supplier = (m?.supplier || "(미지정)");
    const lk = lotKeyOf(e);
    if (!lk) continue;
    if (!consumedByLot.has(lk)) consumedByLot.set(lk, new Map());
    const inner = consumedByLot.get(lk)!;
    inner.set(supplier, (inner.get(supplier) ?? 0) + (e.actualQty || 0));
  }
  for (const [lk, bySupplier] of Array.from(consumedByLot.entries())) {
    const lot = lotByCode.get(lk);
    if (!lot) continue;
    if (lot.status === "폐기" || lot.status === "삭제됨" || lot.status === "테스트") continue;
    const output = lot.actualProducedQty ?? 0;
    const entries = Array.from(bySupplier.entries());
    const totalG = entries.reduce((s, [, g]) => s + g, 0);
    if (totalG <= 0) continue;
    for (const [supplier, g] of entries) {
      const row = ensure(supplier);
      row.consumedG += g;
      row.outputUnits += output * (g / totalG);
    }
  }

  // ─── 수율 계산 ───
  for (const row of Array.from(agg.values())) {
    row.outputUnits = Math.round(row.outputUnits * 100) / 100;
    row.yieldPerUnit = row.receivedUnits > 0
      ? Math.round((row.outputUnits / row.receivedUnits) * 1000) / 1000
      : null;
    row.yieldPerKg = row.contentWeightG > 0
      ? Math.round((row.outputUnits / (row.contentWeightG / 1000)) * 100) / 100
      : null;
  }

  return Array.from(agg.values()).sort((a, b) => b.outputUnits - a.outputUnits);
}
