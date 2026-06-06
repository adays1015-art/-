import type { SetBomComponentType, SetBomLine } from "@/types";
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

const TAB = SHEET_TABS.setBom;

// User-spec sheet header — keep in sync with manual sheet creation.
export const SET_BOM_HEADER = [
  "id", "setCode", "setName", "componentType", "componentCode", "componentName",
  "qty", "unitCost", "unitCostSource", "note", "createdAt", "updatedAt",
] as const;

// Soft-delete sentinel — written into the note field when a row is deleted.
// We can't actually remove rows via the Apps Script API surface, so reads
// filter on this prefix instead.
const DELETED_PREFIX = "[삭제됨]";

function normalizeType(raw: unknown): SetBomComponentType {
  const t = String(raw ?? "").toLowerCase().trim();
  if (t === "item" || t === "품목")     return "item";
  if (t === "material" || t === "원료") return "material";
  if (t === "package" || t === "패키지") return "package";
  if (t === "option" || t === "옵션")   return "option";
  return "item";
}

function fromRow(r: Record<string, string>): SetBomLine {
  return {
    id: r.id ?? "",
    setCode:
      r.setCode ??
      r.setOptionCode ??
      r.setOptionId ??
      r["세트코드"] ??
      r["옵션코드"] ??
      "",
    setName:
      r.setName ??
      r["세트명"] ??
      r["옵션명"] ??
      "",
    componentType: normalizeType(
      r.componentType ?? r.type ?? r["구성유형"] ?? r["유형"] ?? "item",
    ),
    componentCode:
      r.componentCode ??
      r.code ??
      r["구성코드"] ??
      r.itemNo ??
      r["품목번호"] ??
      "",
    componentName:
      r.componentName ??
      r.name ??
      r["구성명"] ??
      r["품목명"] ??
      "",
    qty: Number(r.qty ?? r.quantity ?? r["수량"]) || 0,
    unitCost: Number(r.unitCost ?? r.unitPrice ?? r.price ?? r["단가"]) || 0,
    unitCostSource:
      r.unitCostSource ??
      r.costSource ??
      r["단가출처"] ??
      "",
    note: r.note ?? r["비고"] ?? "",
    createdAt: r.createdAt ?? r["생성일시"] ?? "",
    updatedAt: r.updatedAt ?? r["수정일시"] ?? "",
  };
}

function toRow(b: SetBomLine): (string | number | boolean)[] {
  return [
    b.id, b.setCode, b.setName, b.componentType, b.componentCode, b.componentName,
    b.qty, b.unitCost, b.unitCostSource, b.note, b.createdAt, b.updatedAt,
  ];
}

function isDeleted(b: SetBomLine): boolean {
  return (b.note ?? "").startsWith(DELETED_PREFIX);
}

/**
 * 세트BOM 전체 행 읽기. 시트가 없으면 [] 반환.
 * 소프트 삭제된 (note 가 "[삭제됨]" 로 시작) 행은 결과에서 제외됩니다.
 */
export async function listSetBom(): Promise<SetBomLine[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow).filter((b) => !isDeleted(b));
  }
  return (getStore().setBom ?? []).filter((b) => !isDeleted(b));
}

/** 지정 setCode 의 BOM 행만 필터. */
export function filterSetBomBy(
  setBom: SetBomLine[],
  setCode: string,
): SetBomLine[] {
  const needle = String(setCode ?? "").trim();
  if (!needle) return [];
  return setBom.filter((b) => b.setCode === needle);
}

// ─── CRUD ──────────────────────────────────────────────────
// 신규 시트 생성/스키마 자동 변경은 하지 않습니다 — 사용자가 시트를
// 직접 관리합니다. 시트가 없으면 append 시도가 실패할 수 있으나,
// 시트가 존재하는 경우(현재 사용자가 만든 상태)는 정상 동작.

export async function createSetBomLine(
  input: Omit<SetBomLine, "id" | "createdAt" | "updatedAt">
    & { id?: string; createdAt?: string; updatedAt?: string },
): Promise<SetBomLine> {
  const now = new Date().toISOString();
  const b: SetBomLine = {
    id: input.id || genId("SB"),
    setCode: input.setCode ?? "",
    setName: input.setName ?? "",
    componentType: input.componentType,
    componentCode: input.componentCode ?? "",
    componentName: input.componentName ?? "",
    qty: Number(input.qty) || 0,
    unitCost: Number(input.unitCost) || 0,
    unitCostSource: input.unitCostSource ?? "",
    note: input.note ?? "",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(b), [...SET_BOM_HEADER]);
  } else {
    const s = getStore();
    if (!s.setBom) s.setBom = [];
    s.setBom.push(b);
  }
  return b;
}

export async function updateSetBomLine(
  id: string,
  patch: Partial<Omit<SetBomLine, "id" | "createdAt">>,
): Promise<SetBomLine | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    // Refresh the existing row (read full sheet, including deleted)
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((b) => b.id === id);
    if (!existing) return null;
    const merged: SetBomLine = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...SET_BOM_HEADER]);
    return merged;
  }
  const list = getStore().setBom ?? [];
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...patch,
    id,
    createdAt: list[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  return list[idx];
}

/**
 * 소프트 삭제. note 에 "[삭제됨]" prefix 를 붙입니다. 시트 row 자체는
 * 남고 listSetBom() 의 결과에서만 제외됩니다.
 */
export async function softDeleteSetBomLine(id: string): Promise<boolean> {
  // Find current note to preserve content with prefix.
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((b) => b.id === id);
    if (!existing) return false;
    if (isDeleted(existing)) return true; // Already deleted; idempotent.
    const newNote = `${DELETED_PREFIX} ${(existing.note ?? "").trim()}`.trim();
    const updated = await updateSetBomLine(id, { note: newNote });
    return updated !== null;
  }
  const list = getStore().setBom ?? [];
  const idx = list.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  if (isDeleted(list[idx])) return true;
  list[idx] = {
    ...list[idx],
    note: `${DELETED_PREFIX} ${(list[idx].note ?? "").trim()}`.trim(),
    updatedAt: new Date().toISOString(),
  };
  return true;
}
