import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "info";
}) {
  const toneClass = {
    default: "text-ink-900",
    warning: "text-amber-600",
    danger: "text-red-600",
    success: "text-emerald-600",
    info: "text-blue-600",
  }[tone];
  return (
    <div className="panel panel-pad">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-500">
          {label}
        </div>
        {icon && <div className="text-ink-400">{icon}</div>}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}
