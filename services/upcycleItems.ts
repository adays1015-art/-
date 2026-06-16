import type { Item, ItemStatus, ProductType } from "@/types";
import {
  appendRow,
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.upcycleItems;

export const ITEM_HEADER = [
  "id", "itemNo", "productType", "colorName", "colorCode",
  "scentName", "scentCode", "status", "stock", "safetyStock",
  "unit", "productionUnit", "note",
];

function toRow(i: Item): (string | number | boolean)[] {
  return [
    i.id, i.itemNo, i.productType, i.colorName, i.colorCode,
    i.scentName, i.scentCode, i.status, i.stock, i.safetyStock,
    i.unit, i.productionUnit, i.note,
  ];
}

function fromRow(r: Record<string, string>): Item {
  return {
    id: r.id ?? "",
    itemNo: r.itemNo ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    colorName: r.colorName ?? "",
    colorCode: r.colorCode ?? "",
    scentName: r.scentName ?? "",
    scentCode: r.scentCode ?? "",
    status: (r.status as ItemStatus) ?? "사용중",
    stock: Number(r.stock) || 0,
    safetyStock: Number(r.safetyStock) || 0,
    unit: r.unit ?? "개",
    productionUnit: Number(r.productionUnit) || 100,
    note: r.note ?? "",
  };
}

export async function listItems(): Promise<Item[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().upcycleItems;
}

export async function getItemByNo(itemNo: string): Promise<Item | null> {
  const list = await listItems();
  return list.find((i) => i.itemNo === itemNo) ?? null;
}

export async function createItem(input: Omit<Item, "id">): Promise<Item> {
  const i: Item = { ...input, id: genId("I") };
  if ((await useSheets())) await appendRow(TAB, toRow(i), ITEM_HEADER);
  else getStore().upcycleItems.push(i);
  return i;
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<Item | null> {
  if ((await useSheets())) {
    // Per spec: locate the row by itemNo (human-readable key on the sheet),
    // compared as string. Then send the full updated row.
    const existing = (await listItems()).find((i) => i.id === id);
    if (!existing) return null;
    const merged: Item = { ...existing, ...patch, id };
    const rowNum = await findRowNumberByColumn(TAB, "itemNo", String(existing.itemNo));
    if (!rowNum) throw new Error(`품목마스터에서 itemNo=${existing.itemNo} 행을 찾지 못했습니다.`);
    await updateRow(TAB, rowNum, toRow(merged), ITEM_HEADER);
    return merged;
  }
  const list = getStore().upcycleItems;
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

/**
 * Add to item stock by itemNo (used by item production completion).
 * Returns the merged item or null if not found.
 */
export async function addItemStock(itemNo: string, qty: number): Promise<Item | null> {
  const item = await getItemByNo(itemNo);
  if (!item) return null;
  return updateItem(item.id, { stock: item.stock + qty });
}

/**
 * Decrement item stock for multiple items (used by set assembly).
 * Returns missing item numbers if not enough stock.
 */
export async function consumeItems(
  uses: { itemNo: string; amount: number }[],
): Promise<{ ok: boolean; missing: string[] }> {
  const items = await listItems();
  const missing: string[] = [];
  for (const u of uses) {
    const it = items.find((x) => x.itemNo === u.itemNo);
    if (!it || it.stock < u.amount) missing.push(u.itemNo);
  }
  if (missing.length) return { ok: false, missing };
  for (const u of uses) {
    const it = items.find((x) => x.itemNo === u.itemNo)!;
    await updateItem(it.id, { stock: it.stock - u.amount });
  }
  return { ok: true, missing: [] };
}
