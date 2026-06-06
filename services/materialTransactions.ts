import type { MaterialTransaction, MaterialTransactionType } from "@/types";
import {
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  useSheets,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";
import { listMaterials, updateMaterial } from "./materials";
import { logWork } from "./history";

const TAB = SHEET_TABS.materialTransactions;

// Canonical 원료입출고 schema. Header-based mapping only — strictAppendRow
// validates that the sheet has every column before writing.
export const MATERIAL_TRANSACTION_HEADER = [
  "id", "transactionDate", "transactionType",
  "materialCode", "materialName", "manufacturer", "supplier",
  "qty", "unit", "unitCost", "capacity", "totalCost",
  "lotNo", "expiryDate", "disposalReason", "note", "createdAt",
] as const;

function toRow(m: MaterialTransaction): (string | number | boolean)[] {
  return [
    m.id, m.transactionDate, m.transactionType,
    m.materialCode, m.materialName, m.manufacturer, m.supplier,
    m.qty, m.unit, m.unitCost, m.capacity, m.totalCost,
    m.lotNo, m.expiryDate, m.disposalReason, m.note, m.createdAt,
  ];
}

function fromRow(r: Record<string, string>): MaterialTransaction {
  return {
    id: r.id ?? "",
    transactionDate: r.transactionDate ?? "",
    transactionType: ((r.transactionType as MaterialTransactionType) || "입고"),
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    manufacturer: r.manufacturer ?? "",
    supplier: r.supplier ?? "",
    qty: Number(r.qty) || 0,
    unit: r.unit ?? "",
    unitCost: Number(r.unitCost) || 0,
    capacity: r.capacity ?? "",
    totalCost: Number(r.totalCost) || 0,
    lotNo: r.lotNo ?? "",
    expiryDate: r.expiryDate ?? "",
    disposalReason: r.disposalReason ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  };
}

export async function listMaterialTransactions(): Promise<MaterialTransaction[]> {
  if ((await useSheets())) {
    // The 원료입출고 tab may not exist yet on a brand-new spreadsheet —
    // return [] instead of throwing so the page renders.
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().materialTransactions ?? [];
}

/** delta applied to 원료재고.stock for each transaction type. */
function stockDelta(type: MaterialTransactionType, qty: number): number {
  switch (type) {
    case "입고":     return Math.abs(qty);
    case "생산사용": return -Math.abs(qty);
    case "폐기":     return -Math.abs(qty);
    case "재고조정": return qty; // signed — user may enter negative qty
  }
}

/**
 * Append a transaction row AND apply the corresponding stock side-effect to
 * 원료재고. Order:
 *   1. resolve material by materialCode (or id) so we have the canonical record
 *   2. compute stock delta from (type, qty)
 *   3. updateMaterial(id, { stock: newStock }) — strict-mapped
 *   4. strictAppendRow on 원료입출고
 *   5. logWork audit entry
 *
 * Append-only on the history sheet; no update/delete path.
 */
export async function appendMaterialTransaction(
  input: Omit<MaterialTransaction, "id" | "createdAt"> & { id?: string; createdAt?: string; assignee?: string },
): Promise<{ row: MaterialTransaction; stockBefore: number; stockAfter: number; warning?: string }> {
  const now = new Date().toISOString();
  const row: MaterialTransaction = {
    id: input.id || genId("MT"),
    transactionDate: input.transactionDate,
    transactionType: input.transactionType,
    materialCode: input.materialCode,
    materialName: input.materialName,
    manufacturer: input.manufacturer,
    supplier: input.supplier,
    qty: Number(input.qty) || 0,
    unit: input.unit,
    unitCost: Number(input.unitCost) || 0,
    capacity: input.capacity,
    totalCost: Number(input.totalCost) || 0,
    lotNo: input.lotNo,
    expiryDate: input.expiryDate,
    disposalReason: input.disposalReason,
    note: input.note,
    createdAt: input.createdAt || now,
  };

  // Resolve the material so we can adjust its stock.
  const materials = await listMaterials();
  const code = String(row.materialCode || "").trim();
  const target = materials.find(
    (m) => m.id === code || m.materialCode === code,
  );

  let stockBefore = target?.stock ?? 0;
  let stockAfter = stockBefore;
  let warning: string | undefined;

  if (!target) {
    warning = `원료재고에서 '${row.materialCode}' 행을 찾지 못해 stock을 조정하지 않았습니다. 거래 이력만 기록됩니다.`;
  } else {
    const delta = stockDelta(row.transactionType, row.qty);
    stockAfter = stockBefore + delta;
    if (stockAfter < 0) {
      warning = `차감 후 재고가 음수(${stockAfter})입니다. 거래는 기록되었지만 재고를 확인하세요.`;
    }
    await updateMaterial(target.id, { stock: stockAfter });
  }

  // Append history row LAST so a failed stock update doesn't orphan a row.
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(row), [...MATERIAL_TRANSACTION_HEADER]);
  } else {
    const store = getStore();
    if (!store.materialTransactions) store.materialTransactions = [];
    store.materialTransactions.push(row);
  }

  await logWork({
    type: row.transactionType === "입고" ? "원료 입고" : "원료 차감",
    target: `${row.materialName || row.materialCode}`,
    change: `${row.transactionType} ${row.qty}${row.unit} (재고 ${stockBefore} → ${stockAfter})`,
    assignee: input.assignee ?? "",
    note: row.note,
  });

  return { row, stockBefore, stockAfter, warning };
}
