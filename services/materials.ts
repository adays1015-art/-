import type { Material } from "@/types";
import {
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
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
  // Read unitCost from the spec column, fall back to legacy unitPrice.
  const unitCostVal = Number(r.unitCost);
  const unitPriceVal = Number(r.unitPrice);
  const resolvedUnitPrice = Number.isFinite(unitCostVal) && unitCostVal > 0
    ? unitCostVal
    : (Number.isFinite(unitPriceVal) ? unitPriceVal : 0);
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
    unitPrice: resolvedUnitPrice,
    unitCost: Number.isFinite(unitCostVal) ? unitCostVal : undefined,
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
