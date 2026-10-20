import type { RegisterSource, RemnantStatus } from "@/lib/types";

const STATUS: Record<RemnantStatus, { label: string; cls: string }> = {
  available: { label: "가용", cls: "bg-brand-100 text-brand-800 border-brand-200" },
  reserved: { label: "예약", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  used: { label: "사용", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  scrapped: { label: "폐기", cls: "bg-bg-subtle text-ink-600 border-border" },
};

const SOURCE: Record<RegisterSource, string> = {
  manual: "수동 입력",
  ai: "AI 자동",
  ai_corrected: "AI + 수정",
};

export default function StatusBadge({ status }: { status: RemnantStatus }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}

export function sourceLabel(s: RegisterSource) {
  return SOURCE[s];
}

export const STATUS_LABEL: Record<RemnantStatus, string> = {
  available: STATUS.available.label,
  reserved: STATUS.reserved.label,
  used: STATUS.used.label,
  scrapped: STATUS.scrapped.label,
};
