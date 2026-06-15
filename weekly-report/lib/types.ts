// 주간 작업보고 관리 시스템 — 도메인 타입
//
// 목적: 각 팀 인원이 주간 업무를 보고(제출)하고, 관리자가 한 화면에서
// 제출 현황·확인 필요·이슈를 집계해 확인한다.

export type ReportStatus = "작성중" | "제출" | "확인됨";
export const REPORT_STATUSES: ReportStatus[] = ["작성중", "제출", "확인됨"];

export interface WeeklyReport {
  id: string;
  weekStart: string;   // 주 시작일(월요일) YYYY-MM-DD — 보고 대상 주
  weekEnd: string;     // 주 종료일(일요일)
  team: string;        // 팀
  author: string;      // 작성자(팀원)
  thisWeek: string;    // 이번 주 한 일 / 활동
  nextWeek: string;    // 다음 주 계획
  issues: string;      // 이슈 / 특이사항 (있으면 대시보드 '확인 필요'에 강조)
  status: ReportStatus;
  managerNote: string; // 관리자 코멘트
  createdAt: string;
  updatedAt: string;
}

export type ReportInput = Pick<
  WeeklyReport,
  "weekStart" | "weekEnd" | "team" | "author" | "thisWeek" | "nextWeek" | "issues" | "status"
>;

// 팀원 명단 — '미제출자' 집계와 로그인 이름 선택에 사용 (없어도 동작).
export interface Member {
  id: string;
  team: string;
  name: string;
}

// ─── Schedule (일정) — 달력 대시보드 항목 ────────────────────
export const SCHEDULE_CATEGORIES = ["회의", "납품", "출장", "점검", "마감", "기타"] as const;
export type ScheduleCategory = (typeof SCHEDULE_CATEGORIES)[number];

export interface Schedule {
  id: string;
  startDate: string;          // YYYY-MM-DD
  endDate: string;            // 빈 값이면 당일(startDate)
  title: string;
  assignee: string;           // 담당자
  category: ScheduleCategory | "";
  urgent: boolean;            // 급함 수동 표시
  confirmed: boolean;         // true=확인됨, false=확인 필요
  createdAt: string;
  updatedAt: string;
}

export type ScheduleInput = Pick<
  Schedule, "startDate" | "endDate" | "title" | "assignee" | "category" | "urgent"
>;

export type Role = "관리자" | "팀원";

export interface Session {
  role: Role;
  name: string;
  team: string;
}
