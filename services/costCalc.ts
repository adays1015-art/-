import type { CostCalculation } from "@/types";
import {
  findRowNumberByColumn,
  useSheets,
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.costCalc;

export const COST_CALC_HEADER = [
  "id", "targetType", "targetCode", "itemNo",
  "materialCost", "packagingCost", "laborCost", "overheadCost",
  "defectRate", "totalCost", "calculatedAt", "note",
];

function toRow(c: CostCalculation): (string | number | boolean)[] {
  return [
    c.id, c.targetType, c.targetCode, c.itemNo,
    c.materialCost, c.packagingCost, c.laborCost, c.overheadCost,
    c.defectRate, c.totalCost, c.calculatedAt, c.note,
  ];
}

function normalizeTargetType(raw: string | undefined): CostCalculation["targetType"] {
  const t = (raw ?? "").trim();
  // Legacy English values from older rows.
  if (t === "세트" || t === "set") return "세트";
  return "품목";
}

function fromRow(r: Record<string, string>): CostCalculation {
  return {
    id: r.id ?? "",
    targetType: normalizeTargetType(r.targetType),
    targetCode: r.targetCode ?? "",
    itemNo: r.itemNo ?? "",
    materialCost: Number(r.materialCost) || 0,
    packagingCost: Number(r.packagingCost) || 0,
    laborCost: Number(r.laborCost) || 0,
    overheadCost: Number(r.overheadCost) || 0,
    defectRate: Number(r.defectRate) || 0,
    totalCost: Number(r.totalCost) || 0,
    calculatedAt: r.calculatedAt ?? "",
    note: r.note ?? "",
  };
}

export async function listCostCalculations(): Promise<CostCalculation[]> {
  if ((await useSheets())) {
    // 원가계산 tab may not exist yet for users who haven't initialized it —
    // treat missing tab as empty.
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().costCalc ?? [];
}

/** Key used to identify "the same calculation". One row per (targetType + key). */
function keyForRow(c: Pick<CostCalculation, "targetType" | "itemNo" | "targetCode">): string {
  if (c.targetType === "품목") return `품목::${(c.itemNo || c.targetCode || "").trim()}`;
  return `세트::${(c.targetCode || "").trim()}`;
}

/**
 * Insert-or-update by (targetType, itemNo/targetCode). If the client doesn't
 * already know the row id, look up the existing matching row, reuse its id,
 * and update in place. Append only when no match exists. This is what makes
 * "calculate again" overwrite the previous snapshot instead of duplicating.
 */
export async function upsertCostCalculation(input: CostCalculation): Promise<CostCalculation> {
  const now = new Date().toISOString();
  let id = input.id;

  // Find an existing row for this (targetType + key) so subsequent saves update it.
  if (!id) {
    const all = await listCostCalculations();
    const key = keyForRow(input);
    const matches = all
      .filter((c) => keyForRow(c) === key)
      .sort((a, b) => (b.calculatedAt || "").localeCompare(a.calculatedAt || ""));
    if (matches.length > 0) id = matches[0].id;
  }
  if (!id) id = genId("CC");

  const created: CostCalculation = {
    ...input,
    id,
    calculatedAt: input.calculatedAt || now,
  };

  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (rowNum) {
      await strictUpdateRow(TAB, rowNum, toRow(created), COST_CALC_HEADER);
    } else {
      await strictAppendRow(TAB, toRow(created), COST_CALC_HEADER);
    }
    return created;
  }
  const store = getStore();
  if (!store.costCalc) store.costCalc = [];
  const idx = store.costCalc.findIndex((c) => c.id === id);
  if (idx === -1) store.costCalc.push(created);
  else store.costCalc[idx] = created;
  return created;
}

/**
 * Latest saved 품목-type row for an itemNo, or null if none.
 * Used by both the UI indicator and getItemUnitCost fallback.
 */
export function latestForItemNo(
  calculations: CostCalculation[],
  itemNo: string,
): CostCalculation | null {
  if (!itemNo) return null;
  const matches = calculations
    .filter((c) => c.targetType === "품목" && c.itemNo === itemNo && c.totalCost > 0)
    .sort((a, b) => (b.calculatedAt || "").localeCompare(a.calculatedAt || ""));
  return matches[0] ?? null;
}
