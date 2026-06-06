import type { BomTemplateLine, MaterialCategory, ProductType } from "@/types";
import {
  appendRow,
  batchAppendRows,
  findRowNumberByColumn,
  useSheets,
  readRowsOrEmpty,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.bomTemplate;

export const BOM_TEMPLATE_HEADER = [
  "id", "templateName", "productType", "materialCode", "materialName",
  "category", "qty", "unit", "note",
];

function toRow(b: BomTemplateLine): (string | number | boolean)[] {
  return [
    b.id, b.templateName, b.productType, b.materialCode, b.materialName,
    b.category, b.qty, b.unit, b.note,
  ];
}

function fromRow(r: Record<string, string>): BomTemplateLine {
  return {
    id: r.id ?? "",
    templateName: r.templateName ?? "",
    productType: (r.productType as ProductType | "공통" | "") ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    category: (r.category as MaterialCategory) ?? "기타",
    qty: Number(r.qty) || 0,
    unit: r.unit ?? "",
    note: r.note ?? "",
  };
}

export async function listBomTemplateLines(): Promise<BomTemplateLine[]> {
  if ((await useSheets())) {
    // BOM템플릿 tab may not exist yet — return [] instead of throwing so
    // /bom-templates and /bom (which loads template names) don't 500.
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().bomTemplate ?? [];
}

export async function listTemplateNames(): Promise<string[]> {
  const lines = await listBomTemplateLines();
  return Array.from(new Set(lines.map((l) => l.templateName).filter(Boolean)));
}

export async function listLinesByTemplate(templateName: string): Promise<BomTemplateLine[]> {
  const lines = await listBomTemplateLines();
  return lines.filter((l) => l.templateName === templateName);
}

export async function createBomTemplateLine(
  input: Omit<BomTemplateLine, "id">,
): Promise<BomTemplateLine> {
  const created: BomTemplateLine = { ...input, id: genId("BT") };
  if ((await useSheets())) {
    await appendRow(TAB, toRow(created), BOM_TEMPLATE_HEADER);
  } else {
    const store = getStore();
    if (!store.bomTemplate) store.bomTemplate = [];
    store.bomTemplate.push(created);
  }
  return created;
}

export async function updateBomTemplateLine(
  id: string,
  patch: Partial<BomTemplateLine>,
): Promise<BomTemplateLine | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listBomTemplateLines()).find((b) => b.id === id);
    if (!existing) return null;
    const merged: BomTemplateLine = { ...existing, ...patch, id };
    await updateRow(TAB, rowNum, toRow(merged), BOM_TEMPLATE_HEADER);
    return merged;
  }
  const store = getStore();
  if (!store.bomTemplate) store.bomTemplate = [];
  const idx = store.bomTemplate.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  store.bomTemplate[idx] = { ...store.bomTemplate[idx], ...patch, id };
  return store.bomTemplate[idx];
}

export async function deleteBomTemplateLine(id: string): Promise<boolean> {
  // Sheet delete intentionally unsupported (parity with itemBom service);
  // sample mode supports it for tests.
  if ((await useSheets())) return false;
  const store = getStore();
  if (!store.bomTemplate) return false;
  const idx = store.bomTemplate.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  store.bomTemplate.splice(idx, 1);
  return true;
}

/**
 * Duplicate a template under a new name. Each cloned line gets a fresh id.
 * Returns the newly written lines.
 */
/**
 * Save the given BOM rows (from one itemNo) as a new template under `name`.
 * Skips empty/placeholder rows (no materialCode AND no materialName) so the
 * template doesn't pick up half-edited entries. Returns the created lines.
 */
export async function createTemplateFromBom(args: {
  templateName: string;
  productType?: BomTemplateLine["productType"];
  rows: Array<{
    materialCode?: string;
    materialName?: string;
    materialCategory?: BomTemplateLine["category"];
    amountPerUnit?: number;
    qty?: number;
    unit?: string;
    note?: string;
  }>;
}): Promise<BomTemplateLine[]> {
  const name = (args.templateName || "").trim();
  if (!name) return [];
  const productType = args.productType ?? "";

  const cleaned = args.rows.filter((r) => {
    const hasCode = (r.materialCode || "").trim() !== "";
    const hasName = (r.materialName || "").trim() !== "";
    return hasCode || hasName;
  });
  if (cleaned.length === 0) return [];

  const toCreate: BomTemplateLine[] = cleaned.map((r) => ({
    id: genId("BT"),
    templateName: name,
    productType,
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    category: (r.materialCategory as MaterialCategory) ?? "기타",
    qty: Number(r.qty ?? r.amountPerUnit ?? 0) || 0,
    unit: r.unit ?? "",
    note: r.note ?? "",
  }));

  if ((await useSheets())) {
    await batchAppendRows(TAB, toCreate.map(toRow), BOM_TEMPLATE_HEADER);
  } else {
    const store = getStore();
    if (!store.bomTemplate) store.bomTemplate = [];
    store.bomTemplate.push(...toCreate);
  }
  return toCreate;
}

export async function duplicateTemplate(
  sourceName: string,
  newName: string,
): Promise<BomTemplateLine[]> {
  if (!sourceName || !newName || sourceName === newName) return [];
  const src = await listLinesByTemplate(sourceName);
  if (src.length === 0) return [];
  const created: BomTemplateLine[] = src.map((line) => ({
    id: genId("BT"),
    templateName: newName,
    productType: line.productType,
    materialCode: line.materialCode,
    materialName: line.materialName,
    category: line.category,
    qty: line.qty,
    unit: line.unit,
    note: line.note,
  }));
  if ((await useSheets())) {
    await batchAppendRows(TAB, created.map(toRow), BOM_TEMPLATE_HEADER);
  } else {
    const store = getStore();
    if (!store.bomTemplate) store.bomTemplate = [];
    store.bomTemplate.push(...created);
  }
  return created;
}
