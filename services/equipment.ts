import type { Equipment, EquipmentProcessType, EquipmentStatus } from "@/types";
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

const TAB = SHEET_TABS.equipment;

export const EQUIPMENT_HEADER = [
  "id", "equipmentName", "processType", "status", "location", "note",
  "createdAt", "updatedAt",
] as const;

function toRow(e: Equipment): (string | number | boolean)[] {
  return [
    e.id, e.equipmentName, e.processType, e.status, e.location, e.note,
    e.createdAt, e.updatedAt,
  ];
}

function fromRow(r: Record<string, string>): Equipment {
  return {
    id: r.id ?? "",
    equipmentName: r.equipmentName ?? "",
    processType: (r.processType as EquipmentProcessType) ?? "기타",
    status: (r.status as EquipmentStatus) ?? "활성",
    location: r.location ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  };
}

export async function listEquipment(): Promise<Equipment[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().equipment ?? [];
}

export async function createEquipment(
  input: Omit<Equipment, "id" | "createdAt" | "updatedAt">,
): Promise<Equipment> {
  const now = new Date().toISOString();
  const e: Equipment = {
    ...input,
    id: genId("EQ"),
    createdAt: now,
    updatedAt: now,
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(e), [...EQUIPMENT_HEADER]);
  } else {
    const s = getStore();
    if (!s.equipment) s.equipment = [];
    s.equipment.push(e);
  }
  return e;
}

export async function updateEquipment(
  id: string,
  patch: Partial<Omit<Equipment, "id" | "createdAt">>,
): Promise<Equipment | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const existing = (await listEquipment()).find((e) => e.id === id);
    if (!existing) return null;
    const merged: Equipment = {
      ...existing,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...EQUIPMENT_HEADER]);
    return merged;
  }
  const list = getStore().equipment ?? [];
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id, updatedAt: new Date().toISOString() };
  return list[idx];
}
