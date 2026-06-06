import type { SetOption, ProductType, SetSize, SetComposition } from "@/types";
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

const TAB_O = SHEET_TABS.setOptions;
const TAB_C = SHEET_TABS.setComposition;

export const SET_OPTION_HEADER = [
  "id", "productType", "setSize", "optionName", "optionCode", "isActive", "note",
  "salePrice", "commissionRate",
];
export const SET_COMP_HEADER = [
  "id", "setOptionId", "itemNo", "order", "qty", "note",
  "componentType", "componentCode", "componentName",
];

function optToRow(s: SetOption): (string | number | boolean)[] {
  return [
    s.id, s.productType, s.setSize, s.optionName, s.optionCode,
    s.isActive ? "TRUE" : "FALSE", s.note,
    s.salePrice ?? 0, s.commissionRate ?? 0,
  ];
}
function optFromRow(r: Record<string, string>): SetOption {
  return {
    id: r.id ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    optionCode: r.optionCode ?? "",
    isActive: String(r.isActive).toUpperCase() === "TRUE",
    note: r.note ?? "",
    salePrice: Number(r.salePrice) || 0,
    commissionRate: Number(r.commissionRate) || 0,
  };
}

function compToRow(c: SetComposition): (string | number | boolean)[] {
  return [
    c.id, c.setOptionId, c.itemNo, c.order, c.qty, c.note,
    c.componentType ?? "", c.componentCode ?? "", c.componentName ?? "",
  ];
}
function compFromRow(r: Record<string, string>): SetComposition {
  const rawType = (r.componentType ?? "").toLowerCase();
  const componentType: "item" | "material" | undefined =
    rawType === "material" ? "material" :
    rawType === "item" ? "item" :
    undefined;
  return {
    id: r.id ?? "",
    setOptionId: r.setOptionId ?? "",
    itemNo: r.itemNo ?? "",
    order: Number(r.order) || 0,
    qty: Number(r.qty) || 0,
    note: r.note ?? "",
    componentType,
    componentCode: r.componentCode ?? "",
    componentName: r.componentName ?? "",
  };
}

export async function listSetOptions(): Promise<SetOption[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB_O);
    return rows.map(optFromRow);
  }
  return getStore().setOptions;
}
export async function listSetComposition(): Promise<SetComposition[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB_C);
    return rows.map(compFromRow);
  }
  return getStore().setComposition;
}
export async function listCompositionForOption(setOptionId: string): Promise<SetComposition[]> {
  return (await listSetComposition()).filter((c) => c.setOptionId === setOptionId);
}
export async function listOptionsContainingItem(itemNo: string): Promise<{ option: SetOption; qty: number }[]> {
  const [opts, comps] = await Promise.all([listSetOptions(), listSetComposition()]);
  return comps
    .filter((c) => c.itemNo === itemNo)
    .map((c) => ({ option: opts.find((o) => o.id === c.setOptionId), qty: c.qty }))
    .filter((x): x is { option: SetOption; qty: number } => !!x.option);
}

export async function createSetOption(input: Omit<SetOption, "id">): Promise<SetOption> {
  const s: SetOption = { ...input, id: genId("SO") };
  if ((await useSheets())) await appendRow(TAB_O, optToRow(s), SET_OPTION_HEADER);
  else getStore().setOptions.push(s);
  return s;
}

export async function updateSetOption(id: string, patch: Partial<SetOption>): Promise<SetOption | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB_O, "id", id);
    if (!rowNum) return null;
    const existing = (await listSetOptions()).find((s) => s.id === id);
    if (!existing) return null;
    const merged: SetOption = { ...existing, ...patch, id };
    await updateRow(TAB_O, rowNum, optToRow(merged), SET_OPTION_HEADER);
    return merged;
  }
  const list = getStore().setOptions;
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

export async function createComposition(input: Omit<SetComposition, "id">): Promise<SetComposition> {
  const c: SetComposition = { ...input, id: genId("SC") };
  if ((await useSheets())) await appendRow(TAB_C, compToRow(c), SET_COMP_HEADER);
  else getStore().setComposition.push(c);
  return c;
}

export async function deleteComposition(id: string): Promise<boolean> {
  if ((await useSheets())) return false;
  const list = getStore().setComposition;
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
