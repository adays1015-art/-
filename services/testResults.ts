import type { TestResult } from "@/types";
import {
  appendRow,
  findRowNumberByColumn,
  useSheets,
  readRowsOrEmpty,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.testResults;

export const TEST_RESULT_HEADER = [
  "id", "date", "title", "itemNo", "assignee", "result", "note", "imageData", "status",
];

function toRow(t: TestResult): (string | number | boolean)[] {
  return [
    t.id, t.date, t.title, t.itemNo, t.assignee, t.result, t.note, t.imageData,
    t.status || "활성",
  ];
}

function fromRow(r: Record<string, string>): TestResult {
  return {
    id: r.id ?? "",
    date: r.date ?? "",
    title: r.title ?? "",
    itemNo: r.itemNo ?? "",
    assignee: r.assignee ?? "",
    result: r.result ?? "",
    note: r.note ?? "",
    imageData: r.imageData ?? "",
    status: r.status || "활성",
  };
}

export async function listTestResults(): Promise<TestResult[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows
      .map(fromRow)
      .filter((t) => t.status !== "삭제됨")
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }
  return [...getStore().testResults]
    .filter((t) => t.status !== "삭제됨")
    .sort((a, b) => (a.date > b.date ? -1 : 1));
}

export async function createTestResult(input: Omit<TestResult, "id" | "status">): Promise<TestResult> {
  const t: TestResult = { ...input, status: "활성", id: genId("TR") };
  if ((await useSheets())) await appendRow(TAB, toRow(t), TEST_RESULT_HEADER);
  else getStore().testResults.unshift(t);
  return t;
}

/** Soft-delete — 시트는 행 삭제 대신 status="삭제됨" 으로 표시. */
export async function deleteTestResult(id: string): Promise<boolean> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return false;
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((t) => t.id === id);
    if (!existing) return false;
    await updateRow(TAB, rowNum, toRow({ ...existing, status: "삭제됨" }), TEST_RESULT_HEADER);
    return true;
  }
  const list = getStore().testResults;
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  list[idx] = { ...list[idx], status: "삭제됨" };
  return true;
}
