import { NextResponse } from "next/server";
import { KPI_DEFS, computeKpis, weeklySeries } from "@/lib/kpi";
import { getDataset, now } from "@/lib/store";

// GET /api/kpi?days=28 — 현재 KPI + 주간 추이 (결과보고서·외부 집계용)
export function GET(req: Request) {
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 28));
  const ds = getDataset();
  const end = now();
  const from = end - days * 86_400_000;
  return NextResponse.json({
    period: { from: new Date(from).toISOString(), to: new Date(end).toISOString() },
    pilotStart: ds.pilotStart,
    definitions: KPI_DEFS,
    current: computeKpis(ds, from, end),
    weekly: weeklySeries(ds, ds.baselineStart, new Date(end).toISOString())
      .map((p) => ({ weekStart: new Date(p.weekStart).toISOString(), ...p.values })),
  });
}
