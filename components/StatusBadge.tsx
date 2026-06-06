export type BadgeStatus = "예정" | "진행 중" | "완료" | "보류" | "테스트";

const STATUS_STYLES: Record<BadgeStatus, string> = {
  "예정":   "bg-slate-100 text-slate-700 border-slate-200",
  "진행 중": "bg-blue-50 text-blue-700 border-blue-200",
  "완료":   "bg-emerald-50 text-emerald-700 border-emerald-200",
  "보류":   "bg-amber-50 text-amber-700 border-amber-200",
  "테스트": "bg-purple-50 text-purple-700 border-purple-200",
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES["예정"];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}>
      {status}
    </span>
  );
}
