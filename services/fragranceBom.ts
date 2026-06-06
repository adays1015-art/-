import type { FragranceBomLine, MaterialCategory } from "@/types";
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

const TAB = SHEET_TABS.fragranceBom;

export const FRAGRANCE_BOM_HEADER = [
  "id", "fragranceCode", "materialCode", "materialName", "category",
  "qty", "unit", "note", "createdAt",
] as const;

function toRow(b: FragranceBomLine): (string | number | boolean)[] {
  return [
    b.id, b.fragranceCode, b.materialCode, b.materialName, b.category,
    b.qty, b.unit, b.note, b.createdAt,
  ];
}

function fromRow(r: Record<string, string>): FragranceBomLine {
  return {
    id: r.id ?? "",
    fragranceCode: r.fragranceCode ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    category: (r.category as MaterialCategory) ?? "기타",
    qty: Number(r.qty) || 0,
    unit: r.unit ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  };
}

export async function listFragranceBom(): Promise<FragranceBomLine[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().fragranceBom ?? [];
}

export async function listFragranceBomFor(fragranceCode: string): Promise<FragranceBomLine[]> {
  const all = await listFragranceBom();
  return all.filter((b) => b.fragranceCode === fragranceCode);
}

export async function createFragranceBomLine(
  input: Omit<FragranceBomLine, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<FragranceBomLine> {
  const b: FragranceBomLine = {
    ...input,
    id: input.id || genId("FB"),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(b), [...FRAGRANCE_BOM_HEADER]);
  } else {
    const s = getStore();
    if (!s.fragranceBom) s.fragranceBom = [];
    s.fragranceBom.push(b);
  }
  return b;
}

export async function updateFragranceBomLine(id: string, patch: Partial<FragranceBomLine>): Promise<FragranceBomLine | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listFragranceBom()).find((b) => b.id === id);
    if (!existing) return null;
    const merged: FragranceBomLine = { ...existing, ...patch, id };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...FRAGRANCE_BOM_HEADER]);
    return merged;
  }
  const list = getStore().fragranceBom ?? [];
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

export async function deleteFragranceBomLine(id: string): Promise<boolean> {
  // Sheet delete unsupported (parity with itemBom). Sample mode only.
  if ((await useSheets())) return false;
  const list = getStore().fragranceBom ?? [];
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
