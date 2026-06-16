import type { Material } from "@/types";
import {
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
  batchUpdateRows,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";
import { normalizeMaterialCode } from "@/lib/materialCode";

const TAB = SHEET_TABS.materials;

// ─── Canonical 원료재고 schema ─────────────────────────────────
// EXACTLY these columns, in this order. Writes go through strict
// header-mapped helpers so each field lands in its own column — never
// shifted by index. Required-headers validation runs before every write.
//
// NOTE: the legacy `name` column was removed from the write set to fix the
// bug where materialName was being overwritten with materialCode. The reader
// still tolerates a `name` column for back-compat with old rows; the
// canonical fields going forward are materialCode + materialName.
export const MATERIAL_HEADER = [
  "id", "materialCode", "materialName", "category", "stock", "unit", "safetyStock",
  "supplier", "unitPrice", "unitCost", "costUnit", "capacity",
  "inboundDate", "expiryDate", "msds", "note",
] as const;

function toRow(m: Material): (string | number | boolean)[] {
  // Resolve canonical values defensively but write ONLY to the canonical
  // columns above. materialCode never falls back to materialName, and
  // materialName never falls back to materialCode — each comes from its
  // own field on the in-memory Material.
  const materialCode = (m.materialCode ?? m.id ?? "").toString();
  const materialName = (m.materialName ?? m.name ?? "").toString();
  const unitCost = m.unitCost ?? m.unitPrice ?? 0;
  const costUnit = m.costUnit ?? m.unit ?? "";
  return [
    m.id, materialCode, materialName, m.category, m.stock, m.unit, m.safetyStock,
    m.supplier, m.unitPrice, unitCost, costUnit, m.capacity ?? "",
    m.inboundDate, m.expiryDate, m.msds ? "TRUE" : "FALSE", m.note,
  ];
}

/** Build a stable identifier for a material row.
 *  Sheet column `id` may be empty — fall back to materialCode, then to
 *  a synthesized slug of materialName/name. Used as the BOM dropdown key.
 */
function synthMaterialId(r: Record<string, string>, name: string): string {
  const rawId = (r.id ?? "").trim();
  if (rawId) return rawId;
  const code = (r.materialCode ?? "").trim();
  if (code) return code;
  return name ? `MAT-${name}` : "";
}

function fromRow(r: Record<string, string>): Material {
  const materialName = (r.materialName ?? r.name ?? "").trim();
  const materialCode = (r.materialCode ?? r.id ?? "").trim();
  const id = synthMaterialId(r, materialName);
  // unitPrice = 구입 당시 단가(구입단가), unitCost = 사용단위당 단가(예: 원/g).
  // 과거에는 unitCost 가 있으면 unitPrice 를 그것으로 덮어써서 "구입단가"가
  // 화면에서 사라지고(직원 혼동) 수정 저장 시 시트의 구입단가까지 손상되는
  // 문제가 있었음 → 이제 구입단가를 그대로 보존한다.
  const unitCostVal = Number(r.unitCost);
  const unitPriceVal = Number(r.unitPrice);
  const purchasePrice = Number.isFinite(unitPriceVal) ? unitPriceVal : 0;
  const capacityVal = Number(r.capacity);
  // 사용단위당 단가: unitCost 컬럼이 있으면 사용, 없으면 (구입단가 / 구입용량)
  // 으로 보정. 둘 다 없는 레거시 행은 undefined → resolveMaterialUnitCost 가
  // 구입단가로 폴백(과거엔 구입단가가 곧 단위당 단가였음).
  let unitCostResolved: number | undefined =
    Number.isFinite(unitCostVal) && unitCostVal > 0 ? unitCostVal : undefined;
  if (unitCostResolved === undefined && Number.isFinite(capacityVal) && capacityVal > 0 && purchasePrice > 0) {
    unitCostResolved = Math.round(purchasePrice / capacityVal);
  }
  return {
    id,
    materialCode,
    materialName,
    name: materialName,
    category: (r.category as Material["category"]) ?? "기타",
    stock: Number(r.stock) || 0,
    unit: r.unit ?? "",
    safetyStock: Number(r.safetyStock) || 0,
    supplier: r.supplier ?? "",
    unitPrice: purchasePrice,
    unitCost: unitCostResolved,
    costUnit: r.costUnit ?? r.unit ?? "",
    // Optional fallback unit-cost columns (read-only).
    purchaseUnitCost: Number.isFinite(Number(r.purchaseUnitCost)) ? Number(r.purchaseUnitCost) : undefined,
    price: Number.isFinite(Number(r.price)) ? Number(r.price) : undefined,
    lastPurchasePrice: Number.isFinite(Number(r.lastPurchasePrice)) ? Number(r.lastPurchasePrice) : undefined,
    capacity: r.capacity ?? "",
    inboundDate: r.inboundDate ?? "",
    expiryDate: r.expiryDate ?? "",
    msds: String(r.msds).toUpperCase() === "TRUE",
    note: r.note ?? "",
  };
}

export async function listMaterials(): Promise<Material[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().materials;
}

export async function createMaterial(input: Omit<Material, "id">): Promise<Material> {
  // ─── Strict uniqueness validation on materialCode ─────────
  // Reject duplicates BEFORE the strict append so we never write a
  // colliding code into 원료재고. Code is normalized (trim + uppercase) for
  // the comparison; empty codes are allowed and skip the check (legacy
  // rows may not have codes yet).
  const newCode = normalizeMaterialCode(input.materialCode);
  if (newCode) {
    const existing = await listMaterials();
    const dup = existing.find((m) => normalizeMaterialCode(m.materialCode) === newCode);
    if (dup) {
      throw new Error(
        `원료코드 중복 — '${input.materialCode}' 은(는) 이미 사용 중입니다 ` +
        `(원료: ${dup.materialName || dup.name || dup.id}).`,
      );
    }
  }
  const m: Material = { ...input, id: genId("M") };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(m), [...MATERIAL_HEADER]);
  } else {
    getStore().materials.push(m);
  }
  return m;
}

export async function updateMaterial(id: string, patch: Partial<Material>): Promise<Material | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listMaterials()).find((m) => m.id === id);
    if (!existing) return null;
    // Uniqueness check only when materialCode is changing.
    if (patch.materialCode !== undefined) {
      const newCode = normalizeMaterialCode(patch.materialCode);
      if (newCode && newCode !== normalizeMaterialCode(existing.materialCode)) {
        const dup = (await listMaterials()).find(
          (m) => m.id !== id && normalizeMaterialCode(m.materialCode) === newCode,
        );
        if (dup) {
          throw new Error(
            `원료코드 중복 — '${patch.materialCode}' 은(는) 이미 사용 중입니다 ` +
            `(원료: ${dup.materialName || dup.name || dup.id}).`,
          );
        }
      }
    }
    const merged: Material = { ...existing, ...patch, id };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...MATERIAL_HEADER]);
    return merged;
  }
  const list = getStore().materials;
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

/**
 * Decrement raw material stock. Returns the missing material IDs if not enough.
 */
export async function consumeMaterials(
  uses: { materialId: string; amount: number }[],
): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  if (uses.length === 0) return { ok: true, missing: [] };

  // ─── Mock store path (no sheets) — unchanged behavior ─────
  if (!(await useSheets())) {
    const list = await listMaterials();
    for (const u of uses) {
      const m = list.find((x) => x.id === u.materialId);
      if (!m || m.stock < u.amount) missing.push(u.materialId);
    }
    if (missing.length) return { ok: false, missing };
    for (const u of uses) {
      const m = list.find((x) => x.id === u.materialId)!;
      await updateMaterial(m.id, { stock: m.stock - u.amount });
    }
    return { ok: true, missing: [] };
  }

  // ─── Sheets path — single read + single batched write ─────
  // Previously this looped one updateMaterial per material, and each
  // updateMaterial re-read the whole sheet (findRow + listMaterials +
  // strictUpdateRow). For N materials that was ~3N sheet round-trips — the
  // dominant cause of slow 품목생산 saves. Now: read the sheet once to map
  // id → { rowNumber, stock }, run the same all-or-nothing stock check, then
  // write every stock cell in ONE batchUpdateRows call (stock column only).
  //
  // Row numbers are derived by position: readRows preserves sheet order with
  // no filtering, so data row index i is sheet row i + 2. Ids are built with
  // the SAME synthMaterialId logic listMaterials uses, so the keys here match
  // the materialIds callers pass (which originate from listMaterials).
  const raw = await readRows<Record<string, string>>(TAB);
  const byId = new Map<string, { rowNumber: number; stock: number }>();
  raw.forEach((r, i) => {
    const name = (r.materialName ?? r.name ?? "").trim();
    const id = synthMaterialId(r, name);
    // First row wins — matches listMaterials / Array.find resolution order.
    if (id && !byId.has(id)) {
      byId.set(id, { rowNumber: i + 2, stock: Number(r.stock) || 0 });
    }
  });

  // All-or-nothing stock check (unchanged semantics).
  for (const u of uses) {
    const m = byId.get(u.materialId);
    if (!m || m.stock < u.amount) missing.push(u.materialId);
  }
  if (missing.length) return { ok: false, missing };

  // Aggregate per row so repeated uses of the same material accumulate
  // instead of overwriting each other.
  const newStockByRow = new Map<number, number>();
  for (const u of uses) {
    const m = byId.get(u.materialId)!;
    const prev = newStockByRow.has(m.rowNumber)
      ? (newStockByRow.get(m.rowNumber) as number)
      : m.stock;
    newStockByRow.set(m.rowNumber, prev - u.amount);
  }
  const updates = Array.from(newStockByRow.entries()).map(
    ([rowNumber, stock]) => ({
      rowNumber,
      values: [stock] as (string | number | boolean)[],
    }),
  );
  await batchUpdateRows(TAB, updates, ["stock"]);
  return { ok: true, missing: [] };
}
