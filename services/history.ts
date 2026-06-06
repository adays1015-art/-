import type { WorkLog, WorkLogType } from "@/types";
import {
  appendRow,
  useSheets,
  readRows,
  SHEET_TABS,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId, nowISO } from "@/lib/utils";

const TAB = SHEET_TABS.history;

export const HISTORY_HEADER = ["id", "time", "type", "target", "change", "assignee", "note"];

function toRow(w: WorkLog): (string | number | boolean)[] {
  return [w.id, w.time, w.type, w.target, w.change, w.assignee, w.note];
}

function fromRow(r: Record<string, string>): WorkLog {
  return {
    id: r.id ?? "",
    time: r.time ?? "",
    type: (r.type as WorkLogType) ?? "수정",
    target: r.target ?? "",
    change: r.change ?? "",
    assignee: r.assignee ?? "",
    note: r.note ?? "",
  };
}

export async function listHistory(): Promise<WorkLog[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow).sort((a, b) => (a.time > b.time ? -1 : 1));
  }
  return [...getStore().history].sort((a, b) => (a.time > b.time ? -1 : 1));
}

export async function logWork(input: Omit<WorkLog, "id" | "time"> & { time?: string }): Promise<WorkLog> {
  const w: WorkLog = {
    id: genId("W"),
    time: input.time ?? nowISO(),
    type: input.type,
    target: input.target,
    change: input.change,
    assignee: input.assignee,
    note: input.note,
  };
  if ((await useSheets())) {
    await appendRow(TAB, toRow(w), HISTORY_HEADER);
  } else {
    getStore().history.unshift(w);
  }
  return w;
}
