import type { WeeklyReport, WeeklyReportStatus } from "@/types";
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

const TAB = SHEET_TABS.weeklyReports;

// 시트 헤더 — 수동 시트 생성 시 동일하게 유지.
export const WEEKLY_REPORT_HEADER = [
  "id", "weekStart", "weekEnd", "author", "department",
  "thisWeek", "nextWeek", "issues", "note", "status", "createdAt", "updatedAt",
] as const;

function normalizeStatus(raw: unknown): WeeklyReportStatus {
  const s = String(raw ?? "").trim();
  if (s === "제출" || s === "submitted") return "제출";
  if (s === "삭제됨" || s === "deleted") return "삭제됨";
  return "작성중";
}

function fromRow(r: Record<string, string>): WeeklyReport {
  return {
    id: r.id ?? "",
    weekStart: r.weekStart ?? r["주시작일"] ?? "",
    weekEnd: r.weekEnd ?? r["주종료일"] ?? "",
    author: r.author ?? r["작성자"] ?? "",
    department: r.department ?? r["부서"] ?? "",
    thisWeek: r.thisWeek ?? r["이번주업무"] ?? "",
    nextWeek: r.nextWeek ?? r["다음주계획"] ?? "",
    issues: r.issues ?? r["특이사항"] ?? "",
    note: r.note ?? r["비고"] ?? "",
    status: normalizeStatus(r.status ?? r["상태"]),
    createdAt: r.createdAt ?? r["생성일시"] ?? "",
    updatedAt: r.updatedAt ?? r["수정일시"] ?? "",
  };
}

function toRow(w: WeeklyReport): (string | number | boolean)[] {
  return [
    w.id, w.weekStart, w.weekEnd, w.author, w.department,
    w.thisWeek, w.nextWeek, w.issues, w.note, w.status, w.createdAt, w.updatedAt,
  ];
}

/**
 * 주간작업보고 전체 행 읽기. 시트가 없으면 [] 반환.
 * "삭제됨" 행 포함 — 숨김 처리는 호출 측(UI)에서 담당.
 */
export async function listWeeklyReports(): Promise<WeeklyReport[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().weeklyReports ?? [];
}

export async function createWeeklyReport(
  input: Omit<WeeklyReport, "id" | "createdAt" | "updatedAt">
    & { id?: string; createdAt?: string; updatedAt?: string },
): Promise<WeeklyReport> {
  const now = new Date().toISOString();
  const w: WeeklyReport = {
    id: input.id || genId("WR"),
    weekStart: input.weekStart ?? "",
    weekEnd: input.weekEnd ?? "",
    author: input.author ?? "",
    department: input.department ?? "",
    thisWeek: input.thisWeek ?? "",
    nextWeek: input.nextWeek ?? "",
    issues: input.issues ?? "",
    note: input.note ?? "",
    status: normalizeStatus(input.status) === "삭제됨" ? "작성중" : normalizeStatus(input.status),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(w), [...WEEKLY_REPORT_HEADER]);
  } else {
    const s = getStore();
    if (!s.weeklyReports) s.weeklyReports = [];
    s.weeklyReports.push(w);
  }
  return w;
}

export async function updateWeeklyReport(
  id: string,
  patch: Partial<Omit<WeeklyReport, "id" | "createdAt">>,
): Promise<WeeklyReport | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((w) => w.id === id);
    if (!existing) return null;
    const merged: WeeklyReport = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...WEEKLY_REPORT_HEADER]);
    return merged;
  }
  const list = getStore().weeklyReports ?? [];
  const idx = list.findIndex((w) => w.id === id);
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

/** 주간보고 소프트 삭제 — status를 "삭제됨"으로 전환 (시트/목록에서 숨김). */
export async function deleteWeeklyReport(id: string): Promise<WeeklyReport | null> {
  return updateWeeklyReport(id, { status: "삭제됨" });
}
