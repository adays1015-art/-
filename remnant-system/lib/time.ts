// 서버(Vercel 등)는 UTC로 돌기 때문에 날짜 계산·표시는 한국 시간(KST, UTC+9) 기준으로 맞춘다.
const KST_OFFSET = 9 * 3_600_000;
const DAY = 86_400_000;

// KST 기준 그날 0시의 타임스탬프
export function kstDayStart(t: number): number {
  return Math.floor((t + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
}

// KST 기준 그 주 월요일 0시
export function kstWeekStart(t: number): number {
  const day = kstDayStart(t);
  const weekday = new Date(day + KST_OFFSET).getUTCDay(); // 0=일
  return day - ((weekday + 6) % 7) * DAY;
}

export function kstParts(t: number) {
  const d = new Date(t + KST_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), weekday: d.getUTCDay(), hour: d.getUTCHours() };
}

export function fmtKstDate(t: number): string {
  const p = kstParts(t);
  return `${p.y}.${p.m}.${p.d}`;
}

export function fmtKstDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
}
