// 주차(월~일) 계산 헬퍼 — UTC 기준으로 YYYY-MM-DD 문자열만 다뤄 TZ 흔들림 없음.

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 주어진 날짜가 속한 주의 월요일(YYYY-MM-DD). */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const dow = d.getUTCDay();             // 0=일 .. 6=토
  const diff = dow === 0 ? -6 : 1 - dow; // 일요일은 직전 월요일로
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** "2026-06-15 ~ 2026-06-21 · 6월 3주" 형태의 라벨. */
export function weekLabel(weekStart: string): string {
  if (!weekStart) return "";
  const end = addDaysISO(weekStart, 6);
  const d = new Date(`${weekStart}T00:00:00Z`);
  const month = d.getUTCMonth() + 1;
  const firstMonday = mondayOf(`${d.getUTCFullYear()}-${String(month).padStart(2, "0")}-01`);
  const weekNo = Math.floor(
    (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${firstMonday}T00:00:00Z`)) / (7 * 86400000),
  ) + 1;
  return `${weekStart} ~ ${end} · ${month}월 ${Math.max(weekNo, 1)}주`;
}

export function genId(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `WR-${t.slice(-5)}${r}`;
}

export function ymd(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 월요일 시작, 6주(42칸) 달력 셀의 YYYY-MM-DD 배열. */
export function monthGrid(year: number, month0: number): string[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const dowMon = (first.getUTCDay() + 6) % 7; // 0=월 .. 6=일
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month0, 1 - dowMon + i));
    cells.push(d.toISOString().slice(0, 10));
  }
  return cells;
}

/** a, b (YYYY-MM-DD) 사이 일수 차 (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86400000);
}

export function monthOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCMonth();
}

export function formatMonthLabel(year: number, month0: number): string {
  return `${year}년 ${month0 + 1}월`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
export function weekdayKo(iso: string): string {
  return WEEKDAY_KO[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return f.format(d);
}
