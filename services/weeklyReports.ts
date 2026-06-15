import type { WeeklyReport, WeeklyReportStatus } from "@/types";
import {
  findRowNumberByColumn,
  getSheetsMode,
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
  useSheets,
} from "@/lib/googleSheets";
import { getEffectiveAppsScriptUrl } from "@/lib/runtimeConfig";
import { appsScriptCreateWeeklyReportDoc } from "@/lib/appsScript";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.weeklyReports;

// 시트 헤더 — 수동 시트 생성 시 동일하게 유지.
export const WEEKLY_REPORT_HEADER = [
  "id", "weekStart", "weekEnd", "author", "department",
  "thisWeek", "nextWeek", "issues", "note", "status",
  "docId", "docUrl", "createdAt", "updatedAt",
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
    docId: r.docId ?? r["문서ID"] ?? "",
    docUrl: r.docUrl ?? r["문서URL"] ?? "",
    createdAt: r.createdAt ?? r["생성일시"] ?? "",
    updatedAt: r.updatedAt ?? r["수정일시"] ?? "",
  };
}

function toRow(w: WeeklyReport): (string | number | boolean)[] {
  return [
    w.id, w.weekStart, w.weekEnd, w.author, w.department,
    w.thisWeek, w.nextWeek, w.issues, w.note, w.status,
    w.docId, w.docUrl, w.createdAt, w.updatedAt,
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
  input: Omit<WeeklyReport, "id" | "docId" | "docUrl" | "createdAt" | "updatedAt">
    & { id?: string; docId?: string; docUrl?: string; createdAt?: string; updatedAt?: string },
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
    docId: input.docId ?? "",
    docUrl: input.docUrl ?? "",
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

/**
 * 주간보고를 Google Docs 문서로 저장(보관)합니다. 데이터(목록·검색·수정)는
 * 시트에 그대로 유지하고, 여기서는 Apps Script를 통해 Docs 문서를 생성/갱신한
 * 뒤 그 docId·docUrl 을 시트 행에 다시 기록합니다.
 *
 * Apps Script 연결 모드에서만 동작합니다(Apps Script가 사용자 계정으로
 * DocumentApp/DriveApp 권한을 갖기 때문). 그 외 모드에서는 명확한 안내 에러.
 */
export async function exportWeeklyReportToDocs(
  id: string,
): Promise<WeeklyReport> {
  const list = await listWeeklyReports();
  const report = list.find((w) => w.id === id);
  if (!report) throw new Error("보고서를 찾을 수 없습니다.");

  const mode = await getSheetsMode();
  if (mode !== "apps-script") {
    throw new Error(
      "Google Docs 저장은 Apps Script 연결 모드에서만 지원됩니다. "
      + "설정 > Google Sheets 연결에서 Apps Script URL을 등록하고, "
      + "Apps Script에 createWeeklyReportDoc 핸들러를 배포해 주세요.",
    );
  }
  const url = await getEffectiveAppsScriptUrl();
  if (!url) throw new Error("Apps Script URL이 설정되지 않았습니다.");

  const fields = [
    { label: "대상 주간", value: `${report.weekStart} ~ ${report.weekEnd}` },
    { label: "작성자", value: report.author },
    { label: "부서 / 팀", value: report.department },
    { label: "이번 주 수행 업무", value: report.thisWeek },
    { label: "다음 주 계획", value: report.nextWeek },
    { label: "특이사항 / 이슈", value: report.issues },
    { label: "기타 비고", value: report.note },
    { label: "상태", value: report.status },
  ];

  const { docId, docUrl } = await appsScriptCreateWeeklyReportDoc(url, {
    docId: report.docId || undefined,
    folderName: "주간작업보고",
    title: `주간 작업보고서 — ${report.author} (${report.weekStart})`,
    fields,
    footer: `작성: ${report.createdAt} · 수정: ${report.updatedAt}`,
  });

  const updated = await updateWeeklyReport(id, { docId, docUrl });
  return updated ?? { ...report, docId, docUrl };
}
