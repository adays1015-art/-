import type { KpiDef, WeeklyPoint } from "@/lib/kpi";
import { formatKpi, isMet } from "@/lib/kpi";
import { kstParts } from "@/lib/time";

const W = 320, H = 120, L = 34, R = 8, T = 10, B = 20;

function shortDate(t: number) {
  const p = kstParts(t);
  return `${p.m}/${p.d}`;
}

// KPI 1종: 현재값(최근 4주) · V1.0 기준 → 목표 · 주간 추이 (목표선 점선, V2.0 도입 시점 세로선)
export default function KpiPanel({
  def, current, series, pilotStart,
}: {
  def: KpiDef;
  current: number | null;
  series: WeeklyPoint[];
  pilotStart: number;
}) {
  const met = isMet(def, current);
  const vals = series.map((p) => p.values[def.key]);
  const nums = [...vals, def.target, def.baseline].filter((v): v is number => v !== null);
  const yMax = def.unit === "pct" ? Math.min(1, Math.max(...nums) * 1.15) : Math.max(...nums) * 1.1;
  const x = (i: number) => L + (i / Math.max(1, series.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);

  const segs: string[] = [];
  let cur = "";
  vals.forEach((v, i) => {
    if (v === null) { if (cur) segs.push(cur); cur = ""; return; }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);

  const pilotIdx = series.findIndex((p) => p.weekStart >= pilotStart);
  const ticks = def.unit === "pct" ? [0, yMax / 2, yMax] : [0, yMax / 2, yMax];
  const tickLabel = (v: number) => def.unit === "pct" ? `${Math.round(v * 100)}%` : v >= 120 ? `${Math.round(v / 60)}분` : `${Math.round(v)}초`;

  return (
    <div className="panel panel-pad flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-ink-600">{def.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{formatKpi(def, current)}</div>
        </div>
        {met !== null && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${met ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {met ? "목표 달성" : "목표 미달"}
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-ink-500">
        V1.0 {def.baseline === null ? "측정 불가" : formatKpi(def, def.baseline)} → 목표 {def.better === "lower" ? "≤" : "≥"} {formatKpi(def, def.target)}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full h-auto" role="img" aria-label={`${def.label} 주간 추이`}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#EEF2F8" />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#7A889C">{tickLabel(v)}</text>
          </g>
        ))}
        {pilotIdx > 0 && (
          <g>
            <rect x={L} y={T} width={x(pilotIdx) - L} height={H - T - B} fill="#F5F7FB" />
            <line x1={x(pilotIdx)} x2={x(pilotIdx)} y1={T} y2={H - B} stroke="#9DBFEA" strokeDasharray="3 3" />
            <text x={x(pilotIdx) + 3} y={T + 9} fontSize="9" fill="#5F95DA">V2.0 도입</text>
            <text x={L + 3} y={T + 9} fontSize="9" fill="#A3AFC0">V1.0</text>
          </g>
        )}
        <line x1={L} x2={W - R} y1={y(def.target)} y2={y(def.target)} stroke="#10B981" strokeWidth="1.25" strokeDasharray="5 4" />
        <text x={W - R} y={y(def.target) - 3} textAnchor="end" fontSize="9" fill="#059669">목표</text>
        {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="#1A4FA0" strokeWidth="2" strokeLinejoin="round" />)}
        {vals.map((v, i) => v === null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.2" fill="#1A4FA0">
            <title>{`${shortDate(series[i].weekStart)} 주: ${formatKpi(def, v)}`}</title>
          </circle>
        ))}
        <text x={L} y={H - 5} fontSize="9" fill="#7A889C">{series.length ? shortDate(series[0].weekStart) : ""}</text>
        <text x={W - R} y={H - 5} textAnchor="end" fontSize="9" fill="#7A889C">{series.length ? shortDate(series[series.length - 1].weekStart) : ""}</text>
      </svg>
      <div className="mt-2 text-[11px] leading-relaxed text-ink-500">{def.formula}</div>
    </div>
  );
}
