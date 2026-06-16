import type { ProductionExecutionMaterial } from "@/types";
import {
  readRowsOrEmpty,
  SHEET_TABS,
  strictBatchAppendRows,
  useSheets,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.upcycleExecution;

// ─── Canonical 품목생산투입원료 schema ─────────────────────────
// EXACTLY these 14 columns, in this order. Writes are schema-validated
// against the sheet's header row via strictBatchAppendRows — if any of
// these names are missing from the sheet, the call FAILS visibly and no
// rows are appended.
//
// Linking: lotNo + itemNo is the canonical join key (lotId is no longer
// part of the schema). The cost-math `actualLot` lookup matches by these.
//
// Note: `note` is intentionally not in this list per the spec.
export const PRODUCTION_EXECUTION_HEADER = [
  "id", "lotNo", "itemNo", "materialCode", "materialName",
  "baseQty", "multiplier", "baseTotalQty", "adjustmentQty", "actualQty",
  "unit", "unitCost", "materialCost", "createdAt",
] as const;

function toRow(m: ProductionExecutionMaterial): (string | number | boolean)[] {
  return [
    m.id, m.lotNo, m.itemNo, m.materialCode, m.materialName,
    m.baseQty, m.multiplier, m.baseTotalQty, m.adjustmentQty, m.actualQty,
    m.unit, m.unitCost, m.materialCost, m.createdAt,
  ];
}

function fromRow(r: Record<string, string>): ProductionExecutionMaterial {
  const baseQty = Number(r.baseQty) || 0;
  const multiplier = Number(r.multiplier) || 1;
  // Fall back to baseQty × multiplier if baseTotalQty wasn't written.
  const baseTotalRaw = (r.baseTotalQty ?? "").toString().trim();
  const baseTotalQty = baseTotalRaw !== ""
    ? Number(baseTotalRaw) || 0
    : baseQty * multiplier;
  const adjustmentQty = Number(r.adjustmentQty) || 0;
  const rawActual = (r.actualQty ?? "").toString().trim();
  const actualQty = rawActual !== "" ? Number(rawActual) || 0 : baseTotalQty + adjustmentQty;
  const unitCost = Number(r.unitCost) || 0;
  const rawMatCost = (r.materialCost ?? "").toString().trim();
  const materialCost = rawMatCost !== "" ? Number(rawMatCost) || 0 : actualQty * unitCost;
  return {
    id: r.id ?? "",
    lotId: r.lotId ?? "",
    lotNo: r.lotNo ?? "",
    itemNo: r.itemNo ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    baseQty,
    multiplier,
    baseTotalQty,
    adjustmentQty,
    actualQty,
    unit: r.unit ?? "",
    unitCost,
    materialCost,
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  };
}

export async function listExecutionMaterials(): Promise<ProductionExecutionMaterial[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().upcycleExecution ?? [];
}

export async function listExecutionMaterialsByItem(
  itemNo: string,
): Promise<ProductionExecutionMaterial[]> {
  const all = await listExecutionMaterials();
  const needle = String(itemNo).trim();
  return all.filter((m) => String(m.itemNo).trim() === needle);
}

export async function listExecutionMaterialsByLot(
  lotIdOrNo: string,
): Promise<ProductionExecutionMaterial[]> {
  const all = await listExecutionMaterials();
  // Match by either lotId (database id) or lotNo (human-readable).
  return all.filter((m) => m.lotId === lotIdOrNo || m.lotNo === lotIdOrNo);
}

/**
 * Append one or more material rows. Append-only — there is no update or
 * delete path. createdAt is stamped server-side so all rows from one
 * production run share a timestamp.
 */
export async function appendExecutionMaterials(
  inputs: Array<Omit<ProductionExecutionMaterial, "id" | "createdAt"> & { id?: string; createdAt?: string }>,
): Promise<ProductionExecutionMaterial[]> {
  if (inputs.length === 0) return [];
  const now = new Date().toISOString();
  const rows: ProductionExecutionMaterial[] = inputs.map((m) => {
    const baseTotalQty = m.baseTotalQty ?? m.baseQty * (m.multiplier || 1);
    const actualQty = m.actualQty ?? baseTotalQty + (m.adjustmentQty || 0);
    const materialCost = m.materialCost ?? actualQty * (m.unitCost || 0);
    return {
      id: m.id || genId("PEM"),
      // lotId is kept on the in-memory type for back-compat reads of legacy
      // rows, but it is NEVER written by the strict appender (it's not in
      // PRODUCTION_EXECUTION_HEADER). Linking is by lotNo + itemNo.
      lotId: m.lotId ?? "",
      lotNo: m.lotNo,
      itemNo: m.itemNo,
      materialCode: m.materialCode,
      materialName: m.materialName,
      baseQty: m.baseQty,
      multiplier: m.multiplier,
      baseTotalQty,
      adjustmentQty: m.adjustmentQty,
      actualQty,
      unit: m.unit,
      unitCost: m.unitCost,
      materialCost,
      // note is also not part of the canonical schema; kept on the type for
      // back-compat but the strict appender drops it.
      note: m.note ?? "",
      createdAt: m.createdAt || now,
    };
  });

  if ((await useSheets())) {
    // Strict schema validation: the sheet MUST already contain every column
    // in PRODUCTION_EXECUTION_HEADER. No auto-create, no reorder, no append
    // on mismatch. Errors surface verbatim to the UI via /api/production-
    // execution → withErrorHandling.
    await strictBatchAppendRows(TAB, rows.map(toRow), [...PRODUCTION_EXECUTION_HEADER]);
  } else {
    const store = getStore();
    if (!store.productionExecution) store.productionExecution = [];
    store.productionExecution.push(...rows);
  }
  return rows;
}
