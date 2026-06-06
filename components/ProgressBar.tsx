export default function ProgressBar({
  value,
  tone = "default",
}: {
  value: number; // 0-100
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const colorClass = {
    default: "bg-beige-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    success: "bg-emerald-500",
  }[tone];
  return (
    <div className="w-full">
      <div className="h-1.5 w-full rounded-full bg-bg-subtle overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
