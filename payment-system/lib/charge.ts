// 청구·수금 파생값 계산 — 서버/클라이언트 공용 순수 함수.
import type { Charge, ChargeStatus } from "@/types";

/** 수금 합계. */
export function paidTotal(c: Charge): number {
  return (c.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

/** 미수 잔액 = 청구금액 − 수금합계 (음수 방지). */
export function balanceOf(c: Charge): number {
  return Math.max(0, (Number(c.amount) || 0) - paidTotal(c));
}

/**
 * 상태 자동 산출.
 *   - 수금합계 ≥ 청구금액  → 수금완료
 *   - 미납 잔액이 있고 수금예정일이 지남 → 연체
 *   - 일부만 수금          → 부분수금
 *   - 그 외                → 미수
 * `today` 는 YYYY-MM-DD. 미지정 시 연체 판정을 건너뛴다(서버 렌더 안정성).
 */
export function statusOf(c: Charge, today?: string): ChargeStatus {
  const amount = Number(c.amount) || 0;
  const paid = paidTotal(c);
  if (amount > 0 && paid >= amount) return "수금완료";
  const overdue = !!today && !!c.dueDate && c.dueDate < today && paid < amount;
  if (overdue) return "연체";
  if (paid > 0) return "부분수금";
  return "미수";
}

export const STATUS_TONE: Record<ChargeStatus, string> = {
  미수: "bg-slate-100 text-slate-700 border-slate-200",
  부분수금: "bg-blue-50 text-blue-700 border-blue-200",
  연체: "bg-red-50 text-red-700 border-red-200",
  수금완료: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
