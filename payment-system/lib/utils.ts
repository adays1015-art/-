// 공용 순수 유틸 — 서버/클라이언트 모두 안전.

export function formatWon(n: number): string {
  return `₩${Math.round(Number(n) || 0).toLocaleString("ko-KR")}`;
}

export function formatNumber(n: number): string {
  return (Number(n) || 0).toLocaleString("ko-KR");
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function genId(prefix: string): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0");
  return `${prefix}-${t.slice(-5)}${r}`;
}
