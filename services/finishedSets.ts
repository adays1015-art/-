import type { FinishedSet, ProductType, SetSize } from "@/types";
import {
  appendRow,
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId, todayISO } from "@/lib/utils";

const TAB = SHEET_TABS.finishedSets;

export const FINISHED_SET_HEADER = [
  "id", "productType", "setSize", "optionName", "optionCode",
  "stock", "reserved", "location", "lastProducedAt",
];

function toRow(f: FinishedSet): (string | number | boolean)[] {
  return [
    f.id, f.productType, f.setSize, f.optionName, f.optionCode,
    f.stock, f.reserved, f.location, f.lastProducedAt,
  ];
}

function fromRow(r: Record<string, string>): FinishedSet {
  const stock = Number(r.stock) || 0;
  const reserved = Number(r.reserved) || 0;
  return {
    id: r.id ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    optionCode: r.optionCode ?? "",
    stock,
    reserved,
    available: Math.max(0, stock - reserved),
    location: r.location ?? "",
    lastProducedAt: r.lastProducedAt ?? "",
  };
}

export async function listFinishedSets(): Promise<FinishedSet[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().finishedSets.map((f) => ({ ...f, available: Math.max(0, f.stock - f.reserved) }));
}

export async function getByOptionCode(optionCode: string): Promise<FinishedSet | null> {
  const list = await listFinishedSets();
  return list.find((f) => f.optionCode === optionCode) ?? null;
}

/**
 * Increment finished set stock for a completed assembly lot.
 */
export async function addFinishedSet(args: {
  productType: ProductType;
  setSize: SetSize;
  optionName: string;
  optionCode: string;
  qty: number;
  location?: string;
}): Promise<FinishedSet> {
  const list = await listFinishedSets();
  const match = list.find((f) => f.optionCode === args.optionCode);
  const today = todayISO();
  if (match) {
    const merged: FinishedSet = {
      ...match,
      stock: match.stock + args.qty,
      lastProducedAt: today,
      location: args.location ?? match.location,
    };
    merged.available = Math.max(0, merged.stock - merged.reserved);
    if ((await useSheets())) {
      const rowNum = await findRowNumberByColumn(TAB, "id", match.id);
      if (rowNum) await updateRow(TAB, rowNum, toRow(merged), FINISHED_SET_HEADER);
    } else {
      const store = getStore().finishedSets;
      const idx = store.findIndex((f) => f.id === match.id);
      if (idx !== -1) store[idx] = merged;
    }
    return merged;
  }
  const created: FinishedSet = {
    id: genId("FS"),
    productType: args.productType,
    setSize: args.setSize,
    optionName: args.optionName,
    optionCode: args.optionCode,
    stock: args.qty,
    reserved: 0,
    available: args.qty,
    location: args.location ?? "미지정",
    lastProducedAt: today,
  };
  if ((await useSheets())) await appendRow(TAB, toRow(created), FINISHED_SET_HEADER);
  else getStore().finishedSets.push(created);
  return created;
}

/**
 * Decrement finished set stock (used by shipments).
 */
export async function shipFinishedSet(optionCode: string, qty: number): Promise<{ ok: boolean; available?: number }> {
  const match = await getByOptionCode(optionCode);
  if (!match) return { ok: false };
  if (match.available < qty) return { ok: false, available: match.available };
  const merged: FinishedSet = { ...match, stock: match.stock - qty };
  merged.available = Math.max(0, merged.stock - merged.reserved);
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", match.id);
    if (rowNum) await updateRow(TAB, rowNum, toRow(merged), FINISHED_SET_HEADER);
  } else {
    const store = getStore().finishedSets;
    const idx = store.findIndex((f) => f.id === match.id);
    if (idx !== -1) store[idx] = merged;
  }
  return { ok: true };
}
