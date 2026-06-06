import type { CostItem } from "@/types";
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

const TAB = SHEET_TABS.cost;

export const COST_HEADER = ["id", "name", "amount", "unit", "basis", "note"];

function toRow(c: CostItem): (string | number | boolean)[] {
  return [c.id, c.name, c.amount, c.unit, c.basis, c.note];
}

function fromRow(r: Record<string, string>): CostItem {
  return {
    id: r.id ?? "",
    name: r.name ?? "",
    amount: Number(r.amount) || 0,
    unit: r.unit ?? "원",
    basis: r.basis ?? "",
    note: r.note ?? "",
  };
}

export async function listCostItems(): Promise<CostItem[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().cost;
}

export async function upsertCostItem(input: CostItem): Promise<CostItem> {
  if ((await useSheets())) {
    const rowNum = input.id ? await findRowNumberByColumn(TAB, "id", input.id) : null;
    if (rowNum) {
      await updateRow(TAB, rowNum, toRow(input), COST_HEADER);
      return input;
    }
    const created: CostItem = { ...input, id: input.id || genId("C") };
    await appendRow(TAB, toRow(created), COST_HEADER);
    return created;
  }
  const list = getStore().cost;
  const idx = list.findIndex((c) => c.id === input.id);
  if (idx === -1) {
    const created: CostItem = { ...input, id: input.id || genId("C") };
    list.push(created);
    return created;
  }
  list[idx] = input;
  return input;
}
