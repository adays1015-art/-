import type { Dataset } from "./types";

// 실증 KPI 6종 — 기획서 2.2절 산출식을 그대로 코드로 옮긴 것.
// 모든 값은 원본 기록(잔재·추론·ERP 절단·추천)에서 계산하며 별도 집계 테이블을 두지 않는다.

export type KpiKey = "matchTime" | "omission" | "automation" | "reuse" | "loss" | "adoption";

export interface KpiDef {
  key: KpiKey;
  label: string;
  unit: "sec" | "pct";
  baseline: number | null;   // V1.0 현재
  target: number;            // V2.0 목표
  better: "lower" | "higher";
  formula: string;
}

export const KPI_DEFS: KpiDef[] = [
  { key: "matchTime", label: "매칭 시간", unit: "sec", baseline: 720, target: 60, better: "lower",
    formula: "요청 → 승인까지 걸린 시간의 중앙값" },
  { key: "omission", label: "입력 누락률", unit: "pct", baseline: 0.18, target: 0.05, better: "lower",
    formula: "1 − 등록된 잔재 수 ÷ ERP 절단 실적상 발생 잔재 수" },
  { key: "automation", label: "등록 자동화율", unit: "pct", baseline: 0, target: 0.8, better: "higher",
    formula: "AI 결과를 수정 없이 확정한 건 ÷ 전체 등록 건" },
  { key: "reuse", label: "잔재 재사용률", unit: "pct", baseline: 0.3, target: 0.6, better: "higher",
    formula: "재사용된 잔재 중량 ÷ 처리가 끝난(사용·폐기) 잔재 중량" },
  { key: "loss", label: "매입손실률", unit: "pct", baseline: 0.7, target: 0.4, better: "lower",
    formula: "쓸 수 있었으나 고철 처리된 잔재 중량 ÷ 처리가 끝난 잔재 중량" },
  { key: "adoption", label: "Top-3 채택률", unit: "pct", baseline: null, target: 0.8, better: "higher",
    formula: "AI 추천 중 1~3순위를 그대로 승인한 건 ÷ 결정된 추천 건" },
];

export type KpiValues = Record<KpiKey, number | null>;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

// 처리 완료 잔재가 이보다 적은 구간은 재사용률·손실률을 표시하지 않는다 (표본 부족)
const MIN_CLOSED = 10;

export function computeKpis(ds: Dataset, from: number, to: number): KpiValues {
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= from && t < to;
  };

  const decided = ds.recommendations.filter((r) => inRange(r.decidedAt));
  const matchTime = median(decided.map((r) => (Date.parse(r.decidedAt!) - Date.parse(r.requestedAt)) / 1000));

  const cuts = ds.erpCuts.filter((c) => c.producedRemnant && inRange(c.at));
  const omissionRate = ratio(cuts.filter((c) => !c.remnantId).length, cuts.length);

  const created = ds.remnants.filter((r) => inRange(r.createdAt));
  const automation = ratio(created.filter((r) => r.source === "ai").length, created.length);

  const closed = ds.remnants.filter((r) => inRange(r.closedAt));
  const closedKg = closed.reduce((s, r) => s + r.weightKg, 0);
  const usedKg = closed.filter((r) => r.status === "used").reduce((s, r) => s + r.weightKg, 0);
  const lostKg = closed
    .filter((r) => r.status === "scrapped" && r.scrapReason !== "unusable")
    .reduce((s, r) => s + r.weightKg, 0);

  const aiDecided = decided.filter((r) => r.mode === "ai");
  const adoption = ratio(aiDecided.filter((r) => r.action === "accepted").length, aiDecided.length);

  return {
    matchTime,
    omission: omissionRate,
    automation,
    reuse: closed.length >= MIN_CLOSED ? ratio(usedKg, closedKg) : null,
    loss: closed.length >= MIN_CLOSED ? ratio(lostKg, closedKg) : null,
    adoption,
  };
}

const WEEK = 7 * 86_400_000;

// 월요일 0시 기준 주간 구간
export function weekStarts(fromIso: string, toIso: string): number[] {
  const d = new Date(fromIso);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const out: number[] = [];
  for (let t = d.getTime(); t < Date.parse(toIso); t += WEEK) out.push(t);
  return out;
}

export interface WeeklyPoint { weekStart: number; values: KpiValues }

export function weeklySeries(ds: Dataset, fromIso: string, toIso: string): WeeklyPoint[] {
  return weekStarts(fromIso, toIso).map((w) => ({ weekStart: w, values: computeKpis(ds, w, w + WEEK) }));
}

export function isMet(def: KpiDef, v: number | null): boolean | null {
  if (v === null) return null;
  return def.better === "lower" ? v <= def.target : v >= def.target;
}

export function formatKpi(def: KpiDef, v: number | null): string {
  if (v === null) return "—";
  if (def.unit === "pct") return `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
  return v >= 120 ? `${(v / 60).toFixed(1)}분` : `${Math.round(v)}초`;
}
