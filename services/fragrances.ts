import type { Fragrance, FragranceProductType, FragranceType, FragranceStatus } from "@/types";
import {
  findRowNumberByColumn,
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
  useSheets,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.fragrances;

export const FRAGRANCE_HEADER = [
  "id", "fragranceCode", "fragranceName", "productType", "fragranceType",
  "stock", "unit", "safetyStock", "status", "note", "createdAt",
] as const;

function toRow(f: Fragrance): (string | number | boolean)[] {
  return [
    f.id, f.fragranceCode, f.fragranceName, f.productType, f.fragranceType,
    f.stock, f.unit, f.safetyStock, f.status, f.note, f.createdAt,
  ];
}

function fromRow(r: Record<string, string>): Fragrance {
  return {
    id: r.id ?? "",
    fragranceCode: r.fragranceCode ?? "",
    fragranceName: r.fragranceName ?? "",
    productType: ((r.productType as FragranceProductType) || "향료"),
    fragranceType: ((r.fragranceType as FragranceType) || "기타"),
    stock: Number(r.stock) || 0,
    unit: r.unit || "ml",
    safetyStock: Number(r.safetyStock) || 30,
    status: ((r.status as FragranceStatus) || "사용중"),
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  };
}

export async function listFragrances(): Promise<Fragrance[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().fragrances ?? [];
}

export async function getFragranceByCode(code: string): Promise<Fragrance | null> {
  const all = await listFragrances();
  return all.find((f) => f.fragranceCode === code) ?? null;
}

export async function createFragrance(
  input: Omit<Fragrance, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<Fragrance> {
  const f: Fragrance = {
    ...input,
    id: input.id || genId("FG"),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(f), [...FRAGRANCE_HEADER]);
  } else {
    const s = getStore();
    if (!s.fragrances) s.fragrances = [];
    s.fragrances.push(f);
  }
  return f;
}

export async function updateFragrance(id: string, patch: Partial<Fragrance>): Promise<Fragrance | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listFragrances()).find((f) => f.id === id);
    if (!existing) return null;
    const merged: Fragrance = { ...existing, ...patch, id };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...FRAGRANCE_HEADER]);
    return merged;
  }
  const list = getStore().fragrances ?? [];
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

/**
 * Add to fragrance stock by fragranceCode (used by 향 production completion).
 */
export async function addFragranceStock(fragranceCode: string, qty: number): Promise<Fragrance | null> {
  const f = await getFragranceByCode(fragranceCode);
  if (!f) return null;
  return updateFragrance(f.id, { stock: f.stock + qty });
}
