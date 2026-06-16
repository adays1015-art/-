import type { BomTemplateLine, ItemBomLine, MaterialCategory } from "@/types";
import {
  appendRow,
  batchAppendRows,
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";
import { listLinesByTemplate } from "./bomTemplate";

const TAB = SHEET_TABS.upcycleBom;

// Columns the app writes when persisting BOM rows. Apps Script's auto-expand
// will add any of these that the user's sheet doesn't yet have, leaving
// pre-existing extra columns untouched.
// `qty` mirrors `amountPerUnit` for the spec's preferred column name.
export const BOM_HEADER = [
  "id", "itemNo", "materialId", "materialCode", "materialName", "materialCategory",
  "amountPerUnit", "qty", "unit", "note",
];

function toRow(b: ItemBomLine): (string | number | boolean)[] {
  return [
    b.id, b.itemNo, b.materialId, b.materialCode ?? "", b.materialName, b.materialCategory,
    b.amountPerUnit, b.amountPerUnit, b.unit, b.note,
  ];
}

function fromRow(r: Record<string, string>): ItemBomLine {
  // Accept either column name; prefer the explicit one the user filled in.
  const qtyRaw = (r.amountPerUnit ?? "").toString().trim() !== ""
    ? r.amountPerUnit
    : r.qty;
  return {
    id: r.id ?? "",
    itemNo: r.itemNo ?? "",
    materialId: r.materialId ?? r.materialCode ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    materialCategory: (r.materialCategory as MaterialCategory) ?? "기타",
    amountPerUnit: Number(qtyRaw) || 0,
    unit: r.unit ?? "",
    note: r.note ?? "",
  };
}

export async function listBom(): Promise<ItemBomLine[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().upcycleBom;
}

export async function listBomForItem(itemNo: string): Promise<ItemBomLine[]> {
  const all = await listBom();
  return all.filter((b) => b.itemNo === itemNo);
}

export async function createBomLine(input: Omit<ItemBomLine, "id">): Promise<ItemBomLine> {
  const b: ItemBomLine = { ...input, id: genId("B") };
  if ((await useSheets())) await appendRow(TAB, toRow(b), BOM_HEADER);
  else getStore().upcycleBom.push(b);
  return b;
}

export async function updateBomLine(id: string, patch: Partial<ItemBomLine>): Promise<ItemBomLine | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listBom()).find((b) => b.id === id);
    if (!existing) return null;
    const merged: ItemBomLine = { ...existing, ...patch, id };
    await updateRow(TAB, rowNum, toRow(merged), BOM_HEADER);
    return merged;
  }
  const list = getStore().upcycleBom;
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  return list[idx];
}

export async function deleteBomLine(id: string): Promise<boolean> {
  // Sample mode only — sheet delete is intentionally unsupported here.
  if ((await useSheets())) return false;
  const list = getStore().upcycleBom;
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

/**
 * Apply a BOM template to one itemNo.
 *
 *   mode="append"     → keep existing BOM rows for itemNo and append template rows.
 *                       Duplicates (same materialCode) are SKIPPED (do not overwrite qty).
 *   mode="overwrite"  → delete existing BOM rows for itemNo, then write template rows.
 *                       In Sheets mode, individual row deletion is unsupported, so
 *                       "overwrite" falls back to "append" with a flag in the result.
 *
 * Returns the appended/created lines and the chosen effective mode.
 */
export async function applyTemplateToItem(args: {
  itemNo: string;
  templateName: string;
  mode: "append" | "overwrite";
}): Promise<{
  created: ItemBomLine[];
  skipped: string[];        // materialCodes skipped due to dedupe
  effectiveMode: "append" | "overwrite";
  warning?: string;
}> {
  const tplLines = await listLinesByTemplate(args.templateName);
  if (tplLines.length === 0) {
    return { created: [], skipped: [], effectiveMode: args.mode };
  }
  const sheetMode = await useSheets();

  let warning: string | undefined;
  let effectiveMode = args.mode;
  if (args.mode === "overwrite") {
    if (sheetMode) {
      // Sheet delete unsupported — fall back to additive append with dedupe.
      effectiveMode = "append";
      warning = "Google Sheets 모드에서는 기존 BOM 행을 자동 삭제할 수 없어 '기존 유지 + 추가'로 동작합니다. 필요한 행은 시트에서 직접 삭제하세요.";
    } else {
      const store = getStore();
      store.bom = store.bom.filter((b) => b.itemNo !== args.itemNo);
    }
  }

  const existing = (await listBom()).filter((b) => b.itemNo === args.itemNo);
  const existingCodes = new Set(
    existing
      .map((b) => (b.materialCode || b.materialId || "").trim())
      .filter(Boolean),
  );

  // Build the rows to create in memory first, deduping against existing codes
  // when in append mode. Then write them in ONE batch call (one Apps Script
  // round-trip / one Sheets values.append).
  const toCreate: ItemBomLine[] = [];
  const skipped: string[] = [];
  for (const t of tplLines) {
    const code = (t.materialCode || "").trim();
    if (effectiveMode === "append" && code && existingCodes.has(code)) {
      skipped.push(code);
      continue;
    }
    toCreate.push({
      id: genId("B"),
      itemNo: args.itemNo,
      materialId: code,
      materialCode: code,
      materialName: t.materialName,
      materialCategory: t.category,
      amountPerUnit: t.qty,
      unit: t.unit,
      note: t.note,
    });
    if (code) existingCodes.add(code);
  }

  if (toCreate.length === 0) {
    return { created: [], skipped, effectiveMode, warning };
  }

  if (sheetMode) {
    await batchAppendRows(SHEET_TABS.upcycleBom, toCreate.map(toRow), BOM_HEADER);
  } else {
    getStore().upcycleBom.push(...toCreate);
  }

  return { created: toCreate, skipped, effectiveMode, warning };
}

/**
 * Helper used by the apply confirmation dialog: how many existing BOM rows
 * does this itemNo already have?
 */
export async function countBomForItem(itemNo: string): Promise<number> {
  const all = await listBom();
  return all.filter((b) => b.itemNo === itemNo).length;
}
