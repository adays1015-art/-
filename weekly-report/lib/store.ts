// 데이터 접근 계층.
//   - WR_APPS_SCRIPT_URL 설정 시: Google Sheets (탭 '주간보고', '팀원')
//   - 미설정 시: 로컬 JSON 파일 (개발/미리보기용)

import { promises as fs } from "fs";
import path from "path";
import type { WeeklyReport, ReportInput, Member, Schedule, ScheduleInput, ScheduleCategory } from "./types";
import { genId } from "./week";
import * as sheets from "./sheets";

const TAB_REPORTS = "주간보고";
const TAB_MEMBERS = "팀원";
const TAB_SCHEDULES = "일정";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const MEMBERS_FILE = path.join(DATA_DIR, "members.json");
const SCHEDULES_FILE = path.join(DATA_DIR, "schedules.json");

// ─── file helpers ───────────────────────────────────────────
async function readFileJson<T>(file: string): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
async function writeFileJson<T>(file: string, rows: T[]): Promise<void> {
  // 배포(서버리스) 환경은 파일이 보존되지 않거나 읽기 전용이다. 혼란스러운
  // EROFS 대신 명확한 안내를 던진다 — 배포 시엔 Google Sheets가 필요.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "배포 환경에서는 데이터 저장에 Google Sheets가 필요합니다. "
      + "환경변수 WR_APPS_SCRIPT_URL 을 설정하고 apps-script.gs 를 배포해 주세요.",
    );
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(rows, null, 2), "utf8");
}

// ─── report row mapping (Sheets) ────────────────────────────
const REPORT_HEADER = [
  "id", "weekStart", "weekEnd", "team", "author",
  "thisWeek", "nextWeek", "issues", "status", "managerNote", "createdAt", "updatedAt",
];
function reportFromRow(r: Record<string, string>): WeeklyReport {
  return {
    id: r.id ?? "",
    weekStart: r.weekStart ?? "",
    weekEnd: r.weekEnd ?? "",
    team: r.team ?? "",
    author: r.author ?? "",
    thisWeek: r.thisWeek ?? "",
    nextWeek: r.nextWeek ?? "",
    issues: r.issues ?? "",
    status: (r.status as WeeklyReport["status"]) || "작성중",
    managerNote: r.managerNote ?? "",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  };
}
function reportToValues(w: WeeklyReport): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of REPORT_HEADER) o[k] = (w as unknown as Record<string, unknown>)[k] ?? "";
  return o;
}

// ─── reports ────────────────────────────────────────────────
export async function listReports(): Promise<WeeklyReport[]> {
  const rows = sheets.useSheets()
    ? (await sheets.getSheet(TAB_REPORTS)).map(reportFromRow)
    : await readFileJson<WeeklyReport>(REPORTS_FILE);
  return rows.sort((a, b) =>
    (b.weekStart || "").localeCompare(a.weekStart || "") ||
    (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function getReport(id: string): Promise<WeeklyReport | null> {
  const rows = await listReports();
  return rows.find((r) => r.id === id) ?? null;
}

export async function createReport(input: ReportInput): Promise<WeeklyReport> {
  const now = new Date().toISOString();
  const report: WeeklyReport = {
    id: genId(),
    ...input,
    managerNote: "",
    createdAt: now,
    updatedAt: now,
  };
  if (sheets.useSheets()) {
    await sheets.appendRow(TAB_REPORTS, reportToValues(report));
  } else {
    const rows = await readFileJson<WeeklyReport>(REPORTS_FILE);
    rows.push(report);
    await writeFileJson(REPORTS_FILE, rows);
  }
  return report;
}

export async function updateReport(
  id: string,
  patch: Partial<Omit<WeeklyReport, "id" | "createdAt">>,
): Promise<WeeklyReport | null> {
  if (sheets.useSheets()) {
    const rowNum = await sheets.findRowNumber(TAB_REPORTS, "id", id);
    if (!rowNum) return null;
    const existing = (await listReports()).find((r) => r.id === id);
    if (!existing) return null;
    const merged: WeeklyReport = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await sheets.updateRow(TAB_REPORTS, rowNum, reportToValues(merged));
    return merged;
  }
  const rows = await readFileJson<WeeklyReport>(REPORTS_FILE);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...patch, id, createdAt: rows[idx].createdAt, updatedAt: new Date().toISOString() };
  await writeFileJson(REPORTS_FILE, rows);
  return rows[idx];
}

export async function deleteReport(id: string): Promise<boolean> {
  // Sheets 모드에선 소프트 삭제(상태만)는 updateReport 로 처리. 여기선 파일 모드만 실삭제.
  if (sheets.useSheets()) return false;
  const rows = await readFileJson<WeeklyReport>(REPORTS_FILE);
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeFileJson(REPORTS_FILE, next);
  return true;
}

// ─── schedules (일정; 달력 대시보드) ────────────────────────
const SCHEDULE_HEADER = [
  "id", "startDate", "endDate", "title", "assignee", "category", "urgent", "confirmed", "createdAt", "updatedAt",
];
function boolFrom(v: unknown): boolean { return String(v).trim().toUpperCase() === "TRUE"; }
function scheduleFromRow(r: Record<string, string>): Schedule {
  return {
    id: r.id ?? "",
    startDate: r.startDate ?? "",
    endDate: r.endDate ?? "",
    title: r.title ?? "",
    assignee: r.assignee ?? "",
    category: (r.category as ScheduleCategory) || "",
    urgent: boolFrom(r.urgent),
    confirmed: boolFrom(r.confirmed),
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  };
}
function scheduleToValues(s: Schedule): Record<string, unknown> {
  return {
    id: s.id, startDate: s.startDate, endDate: s.endDate, title: s.title,
    assignee: s.assignee, category: s.category,
    urgent: s.urgent ? "TRUE" : "FALSE", confirmed: s.confirmed ? "TRUE" : "FALSE",
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

export async function listSchedules(): Promise<Schedule[]> {
  const rows = sheets.useSheets()
    ? (await sheets.getSheet(TAB_SCHEDULES)).map(scheduleFromRow)
    : await readFileJson<Schedule>(SCHEDULES_FILE);
  return rows.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
}

export async function createSchedule(input: ScheduleInput): Promise<Schedule> {
  const now = new Date().toISOString();
  const s: Schedule = {
    id: genId(),
    startDate: input.startDate,
    endDate: input.endDate || input.startDate,
    title: input.title,
    assignee: input.assignee ?? "",
    category: input.category ?? "",
    urgent: !!input.urgent,
    confirmed: false,
    createdAt: now,
    updatedAt: now,
  };
  if (sheets.useSheets()) await sheets.appendRow(TAB_SCHEDULES, scheduleToValues(s));
  else {
    const rows = await readFileJson<Schedule>(SCHEDULES_FILE);
    rows.push(s);
    await writeFileJson(SCHEDULES_FILE, rows);
  }
  return s;
}

export async function updateSchedule(id: string, patch: Partial<Omit<Schedule, "id" | "createdAt">>): Promise<Schedule | null> {
  if (sheets.useSheets()) {
    const rowNum = await sheets.findRowNumber(TAB_SCHEDULES, "id", id);
    if (!rowNum) return null;
    const existing = (await listSchedules()).find((s) => s.id === id);
    if (!existing) return null;
    const merged: Schedule = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await sheets.updateRow(TAB_SCHEDULES, rowNum, scheduleToValues(merged));
    return merged;
  }
  const rows = await readFileJson<Schedule>(SCHEDULES_FILE);
  const idx = rows.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...patch, id, createdAt: rows[idx].createdAt, updatedAt: new Date().toISOString() };
  await writeFileJson(SCHEDULES_FILE, rows);
  return rows[idx];
}

export async function deleteSchedule(id: string): Promise<boolean> {
  if (sheets.useSheets()) {
    await sheets.deleteRowBy(TAB_SCHEDULES, "id", id);
    return true;
  }
  const rows = await readFileJson<Schedule>(SCHEDULES_FILE);
  const next = rows.filter((s) => s.id !== id);
  if (next.length === rows.length) return false;
  await writeFileJson(SCHEDULES_FILE, next);
  return true;
}

// ─── members (팀원 명단; 미제출자 집계용, 없어도 됨) ─────────
export async function listMembers(): Promise<Member[]> {
  const rows = sheets.useSheets()
    ? (await sheets.getSheet(TAB_MEMBERS)).map((r) => ({ id: r.id ?? "", team: r.team ?? "", name: r.name ?? "" }))
    : await readFileJson<Member>(MEMBERS_FILE);
  return rows.filter((m) => m.name).sort((a, b) =>
    (a.team || "").localeCompare(b.team || "") || (a.name || "").localeCompare(b.name || ""));
}
