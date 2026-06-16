"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays, Printer, Download, Factory, FlaskConical, AlertTriangle,
  Package, Boxes, Trash2, FileText, Sparkles, ArrowLeftRight,
} from "lucide-react";
import type {
  Item, ItemLot, FragranceLot, FragranceExecutionMaterial, Material,
  Shipment, ProductionExecutionMaterial, MaterialTransaction,
} from "@/types";
import { formatCurrency, formatDateKst, formatNumber, todayISO } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────
// Daily-report only — read-only. Korean operating timezone: dates that
// carry a clock component (ISO datetime / Date object) are mapped to their
// calendar day in Asia/Seoul (UTC+9). Pure date strings (no time component)
// pass through verbatim to avoid double-shifting an already-local value.
//
//   2026-05-30T15:00:00.000Z  →  2026-05-31  (00:00 KST)
//   2026-05-31T00:00:00.000Z  →  2026-05-31  (09:00 KST — same day)
//   2026-05-31                →  2026-05-31  (no shift)
//
// Uses "sv-SE" locale because it formats as YYYY-MM-DD natively, so no
// reassembly is needed.
const KST_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric", month: "2-digit", day: "2-digit",
});

function toKstYmd(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  // Some "sv-SE" implementations may include a literal U+2013; the polyfill
  // path on older browsers uses ASCII "-". Strip anything non-digit-or-dash
  // and re-anchor to YYYY-MM-DD just in case.
  const out = KST_FMT.format(d).replace(/[^\d-]/g, "");
  return out.slice(0, 10);
}

function normalizeYmd(s: unknown): string {
  if (s == null) return "";
  if (s instanceof Date) return toKstYmd(s);
  const raw = String(s).trim();
  if (!raw) return "";
  // Pure date-only ("2026-05-31") — keep as authored; no TZ shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // ISO with time → KST calendar day.
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return toKstYmd(d);
    return raw.slice(0, 10);
  }
  if (/^\d{4}\/\d{2}\/\d{2}/.test(raw)) return raw.slice(0, 10).replace(/\//g, "-");
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  // Anything else parseable → KST calendar day.
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return toKstYmd(d);
  return raw.slice(0, 10);
}
function sameDayISO(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeYmd(a) === normalizeYmd(b);
}

/**
 * Pick the canonical date for a report row, normalized to "YYYY-MM-DD".
 * Priority (first non-empty wins):
 *   1) productionDate
 *   2) date
 *   3) transactionDate
 *   4) createdAt
 * Each candidate goes through normalizeYmd, so ISO timestamps and date-only
 * strings are both accepted. Returns "" if nothing usable.
 */
function resolveRowDate(row: Record<string, unknown>): string {
  const candidates = ["productionDate", "date", "transactionDate", "createdAt"];
  for (const key of candidates) {
    const v = normalizeYmd(row[key]);
    if (v) return v;
  }
  return "";
}

/** Raw date column value used by resolveRowDate (for debug display). */
function rawRowDate(row: Record<string, unknown>): string {
  const candidates = ["productionDate", "date", "transactionDate", "createdAt"];
  for (const key of candidates) {
    const v = row[key];
    if (v != null && String(v).trim() !== "") return `${key}=${String(v)}`;
  }
  return "—";
}
function escapeCsv(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

interface Props {
  itemLots: ItemLot[];
  upcycleLots: ItemLot[];
  fragranceLots: FragranceLot[];
  fragranceExec: FragranceExecutionMaterial[];
  materials: Material[];
  items: Item[];
  shipments: Shipment[];
  execution: ProductionExecutionMaterial[];
  transactions: MaterialTransaction[];
}

export default function DailyReportClient(p: Props) {
  const [date, setDate] = useState<string>(todayISO());
  const [worker, setWorker] = useState<string>("");
  const [managerNote, setManagerNote] = useState<string>("");

  // Unique worker list for the filter (from item + fragrance LOTs).
  const workers = useMemo(() => {
    const s = new Set<string>();
    for (const l of p.itemLots) if (l.assignee) s.add(l.assignee);
    for (const l of p.upcycleLots) if (l.assignee) s.add(l.assignee);
    for (const l of p.fragranceLots) if (l.worker) s.add(l.worker);
    return Array.from(s).sort();
  }, [p.itemLots, p.upcycleLots, p.fragranceLots]);

  // selectedDate normalized once, used by every matcher.
  const selectedDate = useMemo(() => normalizeYmd(date), [date]);

  // ─── date-filtered slices (all driven by resolveRowDate) ──
  // Each row resolves its own canonical date via priority chain:
  // productionDate → date → transactionDate → createdAt.
  const todayItemLots = useMemo(
    () => p.itemLots.filter((l) =>
      l.status !== "폐기"
      && l.status !== "테스트"
      && l.status !== "삭제됨"
      && resolveRowDate(l as unknown as Record<string, unknown>) === selectedDate
      && (!worker || l.assignee === worker)),
    [p.itemLots, selectedDate, worker],
  );
  const todayUpcycleLots = useMemo(
    () => p.upcycleLots.filter((l) =>
      l.status !== "폐기"
      && l.status !== "테스트"
      && l.status !== "삭제됨"
      && resolveRowDate(l as unknown as Record<string, unknown>) === selectedDate
      && (!worker || l.assignee === worker)),
    [p.upcycleLots, selectedDate, worker],
  );
  const todayFragranceLots = useMemo(
    () => p.fragranceLots.filter((l) =>
      resolveRowDate(l as unknown as Record<string, unknown>) === selectedDate
      && (!worker || l.worker === worker)),
    [p.fragranceLots, selectedDate, worker],
  );
  const todayShipments = useMemo(
    () => p.shipments.filter((s) =>
      resolveRowDate(s as unknown as Record<string, unknown>) === selectedDate
      && (!worker || s.assignee === worker)),
    [p.shipments, selectedDate, worker],
  );
  const todayTransactions = useMemo(
    () => p.transactions.filter(
      (t) => resolveRowDate(t as unknown as Record<string, unknown>) === selectedDate),
    [p.transactions, selectedDate],
  );
  // 품목생산투입원료 — matched by the row's OWN date (createdAt) so it
  // surfaces even when its parent LOT didn't make today's cut.
  const todayExec = useMemo(
    () => p.execution.filter(
      (e) => resolveRowDate(e as unknown as Record<string, unknown>) === selectedDate),
    [p.execution, selectedDate],
  );
  // 향생산투입원료 — same rule.
  const todayFragranceExec = useMemo(
    () => p.fragranceExec.filter(
      (e) => resolveRowDate(e as unknown as Record<string, unknown>) === selectedDate),
    [p.fragranceExec, selectedDate],
  );
  const todayDisposals = useMemo(
    () => todayTransactions.filter((t) => t.transactionType === "폐기"),
    [todayTransactions],
  );

  // ─── KPI roll-ups ────────────────────────────────────────
  const kpis = useMemo(() => {
    const lotQty = (l: ItemLot) => l.actualProducedQty ?? l.completedQty ?? 0;
    const lotCost = (l: ItemLot) =>
      l.actualMaterialTotalCost ?? (l.actualUnitCost && l.actualProducedQty ? l.actualUnitCost * l.actualProducedQty : 0);
    // 생산량 — 기존(품목) + 업사이클 분리 집계 후 합산.
    const baseProducedQty = todayItemLots.reduce((s, l) => s + lotQty(l), 0);
    const upcycleProducedQty = todayUpcycleLots.reduce((s, l) => s + lotQty(l), 0);
    const totalProducedQty = baseProducedQty + upcycleProducedQty;
    // 총 생산 원가 = 품목생산 + 향생산 + 업사이클생산 (각 LOT actualMaterialTotalCost)
    const itemProductionCost = todayItemLots.reduce((s, l) => s + lotCost(l), 0);
    const fragranceProductionCost = todayFragranceLots.reduce(
      (s, l) => s + (l.actualMaterialTotalCost || 0), 0);
    const upcycleProductionCost = todayUpcycleLots.reduce((s, l) => s + lotCost(l), 0);
    const baseProductionCost = itemProductionCost + fragranceProductionCost;
    const totalProductionCost = baseProductionCost + upcycleProductionCost;
    // 출고 금액 = 수량 × 단가 (단가 컬럼 도입 후 집계). 기존/업사이클 분리.
    const amountOf = (x: Shipment) => x.qty * (x.unitPrice ?? 0);
    const upcycleShipments = todayShipments.filter((x) => x.line === "업사이클");
    const baseShipments = todayShipments.filter((x) => x.line !== "업사이클");
    const baseShipmentAmount = baseShipments.reduce((s, x) => s + amountOf(x), 0);
    const upcycleShipmentAmount = upcycleShipments.reduce((s, x) => s + amountOf(x), 0);
    const totalShipmentAmount = baseShipmentAmount + upcycleShipmentAmount;
    const upcycleShipQty = upcycleShipments.reduce((s, x) => s + x.qty, 0);
    const lowStockCount = p.materials.filter((m) => m.stock < m.safetyStock).length
      + p.items.filter((i) => i.stock < i.safetyStock).length;
    const fragranceCount = todayFragranceLots.length;
    const disposalCount = todayDisposals.length;
    return {
      totalProducedQty, baseProducedQty, upcycleProducedQty,
      totalProductionCost, baseProductionCost, upcycleProductionCost,
      totalShipmentAmount, baseShipmentAmount, upcycleShipmentAmount, upcycleShipQty,
      lowStockCount, fragranceCount, disposalCount,
    };
  }, [todayItemLots, todayUpcycleLots, todayShipments, todayFragranceLots, todayDisposals, p.materials, p.items]);

  // ─── Rich debug data (temporary) ──────────────────────────
  // For each source: total / matched / first 3 raw / first 3 normalized.
  type DebugSource = { name: string; total: number; matched: number; rawSamples: string[]; normSamples: string[] };
  const debugSources: DebugSource[] = useMemo(() => {
    function build(name: string, rows: unknown[], matched: unknown[]): DebugSource {
      const sample = rows.slice(0, 3) as Record<string, unknown>[];
      return {
        name,
        total: rows.length,
        matched: matched.length,
        rawSamples: sample.map(rawRowDate),
        normSamples: sample.map((r) => resolveRowDate(r) || "—"),
      };
    }
    return [
      build("품목생산LOT", p.itemLots, todayItemLots),
      build("향생산LOT", p.fragranceLots, todayFragranceLots),
      build("원료입출고", p.transactions, todayTransactions),
      build("품목생산투입원료", p.execution, todayExec),
      build("향생산투입원료", p.fragranceExec, todayFragranceExec),
      build("출고이력", p.shipments, todayShipments),
    ];
  }, [
    p.itemLots, todayItemLots,
    p.fragranceLots, todayFragranceLots,
    p.transactions, todayTransactions,
    p.execution, todayExec,
    p.fragranceExec, todayFragranceExec,
    p.shipments, todayShipments,
  ]);

  // ─── 사용 원료 TOP ──────────────────────────────────────
  const topUsedMaterials = useMemo(() => {
    const usage = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    for (const e of todayExec) {
      const k = e.materialCode || e.materialName;
      const cur = usage.get(k) ?? { name: e.materialName || e.materialCode, unit: e.unit, qty: 0, cost: 0 };
      cur.qty += e.actualQty || 0;
      cur.cost += (e.materialCost || (e.actualQty * e.unitCost)) || 0;
      usage.set(k, cur);
    }
    for (const e of todayFragranceExec) {
      const k = e.materialCode || e.materialName;
      const cur = usage.get(k) ?? { name: e.materialName || e.materialCode, unit: e.unit, qty: 0, cost: 0 };
      cur.qty += e.actualQty || 0;
      cur.cost += (e.materialCost || (e.actualQty * e.unitCost)) || 0;
      usage.set(k, cur);
    }
    return Array.from(usage.values()).sort((a, b) => b.cost - a.cost).slice(0, 10);
  }, [todayExec, todayFragranceExec]);

  // ─── 부족 재고 현황 ─────────────────────────────────────
  const lowStock = useMemo(() => {
    const mats = p.materials
      .filter((m) => m.stock < m.safetyStock)
      .map((m) => ({
        kind: "원료", name: m.materialName || m.name, sub: m.category,
        stock: m.stock, safety: m.safetyStock, unit: m.unit,
        gap: m.safetyStock - m.stock,
      }));
    const its = p.items
      .filter((i) => i.stock < i.safetyStock)
      .map((i) => ({
        kind: "품목", name: i.colorName, sub: `${i.itemNo}번 · ${i.productType}`,
        stock: i.stock, safety: i.safetyStock, unit: i.unit,
        gap: i.safetyStock - i.stock,
      }));
    return [...mats, ...its].sort((a, b) => b.gap - a.gap);
  }, [p.materials, p.items]);

  // ─── CSV export ─────────────────────────────────────────
  function exportCsv() {
    const lines: string[] = [];
    lines.push(`일일 작업 보고서,${date}${worker ? `,담당자=${worker}` : ""}`);
    lines.push("");
    lines.push("[KPI]");
    lines.push(`총 생산량,${kpis.totalProducedQty}`);
    lines.push(`총 생산 원가,${Math.round(kpis.totalProductionCost)}`);
    lines.push(`총 출고 금액,${Math.round(kpis.totalShipmentAmount)}`);
    lines.push(`  └ 기존 출고 금액,${Math.round(kpis.baseShipmentAmount)}`);
    lines.push(`  └ 업사이클 출고 금액,${Math.round(kpis.upcycleShipmentAmount)}`);
    lines.push(`부족 재고 개수,${kpis.lowStockCount}`);
    lines.push(`오늘 생산된 향료 수,${kpis.fragranceCount}`);
    lines.push(`폐기 발생 건수,${kpis.disposalCount}`);
    lines.push("");
    lines.push("[오늘 생산 작업]");
    lines.push(["시간", "LOT", "품목/향", "생산수량", "작업자", "실제 원가", "메모"].map(escapeCsv).join(","));
    for (const l of todayItemLots) {
      lines.push([l.date, l.lotCode, `${l.itemNo} ${p.items.find((i) => i.itemNo === l.itemNo)?.colorName ?? ""}`,
        l.actualProducedQty ?? l.completedQty ?? "", l.assignee,
        l.actualMaterialTotalCost ?? "", l.note].map(escapeCsv).join(","));
    }
    for (const l of todayFragranceLots) {
      lines.push([l.productionDate, l.lotNo, `[향] ${l.fragranceName}`,
        l.actualProducedQty, l.worker, l.actualMaterialTotalCost, l.note].map(escapeCsv).join(","));
    }
    for (const l of todayUpcycleLots) {
      lines.push([l.date, l.lotCode, `[업사이클] ${l.itemNo}`,
        l.actualProducedQty ?? l.completedQty ?? "", l.assignee,
        l.actualMaterialTotalCost ?? "", l.note].map(escapeCsv).join(","));
    }
    lines.push("");
    lines.push("[부족 재고]");
    lines.push(["구분", "이름", "현재", "안전", "부족"].map(escapeCsv).join(","));
    for (const r of lowStock) {
      lines.push([r.kind, `${r.name} (${r.sub})`, r.stock, r.safety, r.gap].map(escapeCsv).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-report-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="daily-report-root">
      {/* ─── Header ─────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-6 no-print">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-ink-500">관리 보고</div>
          <div className="mt-1 text-2xl font-semibold text-ink-900">일일 작업 보고서</div>
          <div className="text-xs text-ink-500 mt-1">선택한 일자의 생산·재고·출고를 한 페이지에 요약합니다. PDF 저장은 인쇄(Ctrl+P) → 대상에서 PDF를 선택하세요.</div>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">일자</label>
            <div className="relative">
              <CalendarDays size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-8" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">담당자</label>
            <select className="input w-40" value={worker} onChange={(e) => setWorker(e.target.value)}>
              <option value="">전체</option>
              {workers.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <button className="btn-ghost" onClick={exportCsv} title="CSV 내보내기">
            <Download size={14} /> CSV
          </button>
          <button className="btn-primary" onClick={() => window.print()} title="인쇄 / PDF 저장">
            <Printer size={14} /> 인쇄하기
          </button>
        </div>
      </div>

      {/* ─── Print-only title block ─────────────────────── */}
      <div className="hidden print:block mb-4">
        <div className="text-[11px] tracking-[0.22em] text-ink-500 uppercase">Another Day · B.fter</div>
        <div className="mt-1 text-xl font-semibold text-ink-900">일일 작업 보고서</div>
        <div className="text-xs text-ink-700 mt-0.5">{date}{worker ? ` · 담당자 ${worker}` : ""}</div>
        <div className="h-px bg-ink-200 mt-3"></div>
      </div>

      {/* ─── DEBUG (temporary, no-print) ─────────────────── */}
      <div className="no-print mb-4 panel panel-pad text-[11px] text-ink-700 leading-relaxed">
        <div className="font-semibold text-ink-900 mb-1">[debug] 데이터 매칭 검증</div>
        <div className="mb-2 text-[11px] text-ink-700">
          selectedDate (정규화):
          <span className="font-mono ml-2 px-1.5 py-0.5 rounded bg-bg-subtle text-ink-900">{selectedDate || "—"}</span>
          <span className="ml-2 text-ink-500">입력값: {date}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="text-ink-500">
              <tr>
                <th className="text-left py-1 pr-3">source</th>
                <th className="text-right py-1 pr-3">total</th>
                <th className="text-right py-1 pr-3">matched</th>
                <th className="text-left py-1 pr-3">first 3 raw</th>
                <th className="text-left py-1">first 3 normalized</th>
              </tr>
            </thead>
            <tbody>
              {debugSources.map((s) => (
                <tr key={s.name} className="border-t border-border/60">
                  <td className="py-1 pr-3 font-sans text-ink-900">{s.name}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{s.total}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    <b className={s.matched > 0 ? "text-emerald-700" : (s.total > 0 ? "text-amber-700" : "text-ink-400")}>{s.matched}</b>
                  </td>
                  <td className="py-1 pr-3 text-ink-600 break-all">{s.rawSamples.length ? s.rawSamples.join(" · ") : "—"}</td>
                  <td className="py-1 text-ink-600">{s.normSamples.length ? s.normSamples.join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 text-[10px] text-ink-500 font-sans">
          매칭 우선순위: productionDate → date → transactionDate → createdAt. matched=0이면 해당 source의 첫 행 날짜와 selectedDate를 비교하세요.
        </div>
      </div>

      {/* ─── KPI cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="총 생산량" value={formatNumber(kpis.totalProducedQty)} unit="개" icon={<Factory size={14} />}
          sub={kpis.upcycleProducedQty > 0
            ? <>기존 {formatNumber(kpis.baseProducedQty)} · <span className="text-emerald-700">업사이클 {formatNumber(kpis.upcycleProducedQty)}</span></>
            : undefined} />
        <KpiCard label="총 생산 원가" value={formatCurrency(kpis.totalProductionCost)} icon={<Sparkles size={14} />}
          sub={kpis.upcycleProductionCost > 0
            ? <>기존 {formatCurrency(kpis.baseProductionCost)} · <span className="text-emerald-700">업사이클 {formatCurrency(kpis.upcycleProductionCost)}</span></>
            : undefined} />
        <KpiCard label="총 출고 금액" value={formatCurrency(kpis.totalShipmentAmount)} icon={<Package size={14} />}
          sub={kpis.upcycleShipmentAmount > 0
            ? <>기존 {formatCurrency(kpis.baseShipmentAmount)} · <span className="text-emerald-700">업사이클 {formatCurrency(kpis.upcycleShipmentAmount)}</span></>
            : undefined} />
        <KpiCard label="부족 재고 개수" value={formatNumber(kpis.lowStockCount)} unit="건" tone={kpis.lowStockCount > 0 ? "warn" : "ok"} icon={<AlertTriangle size={14} />} />
        <KpiCard label="오늘 생산된 향료 수" value={formatNumber(kpis.fragranceCount)} unit="건" icon={<FlaskConical size={14} />} />
        <KpiCard label="폐기 발생 건수" value={formatNumber(kpis.disposalCount)} unit="건" tone={kpis.disposalCount > 0 ? "warn" : "ok"} icon={<Trash2 size={14} />} />
      </div>

      {/* ─── [오늘 생산 작업] ────────────────────────────── */}
      <Section title="오늘 생산 작업" subtitle="품목생산LOT · 향생산LOT · 업사이클생산LOT" icon={<Factory size={14} />}>
        <ReportTable head={["시간/날짜","LOT 번호","품목/향","생산수량","작업자","실제 원가","메모"]}>
          {todayItemLots.length === 0 && todayFragranceLots.length === 0 && todayUpcycleLots.length === 0
            ? <EmptyRow cols={7} text="해당 일자의 생산 작업이 없습니다." />
            : <>
                {todayUpcycleLots.map((l) => (
                  <tr key={`ul-${l.id}`} className="bg-emerald-50/30">
                    <td>{formatDateKst(l.date)}</td>
                    <td className="font-mono text-xs">{l.lotCode}</td>
                    <td>
                      <div>
                        <span className="text-[10px] px-1 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 mr-1">업사이클</span>
                        {l.itemNo}
                      </div>
                      <div className="text-[10px] text-ink-500">{l.productType}</div>
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(l.actualProducedQty ?? l.completedQty ?? 0)} 개</td>
                    <td>{l.assignee}</td>
                    <td className="text-right tabular-nums">{l.actualMaterialTotalCost ? formatCurrency(l.actualMaterialTotalCost) : "—"}</td>
                    <td className="text-ink-600">{l.note}</td>
                  </tr>
                ))}
                {todayItemLots.map((l) => {
                  const it = p.items.find((i) => i.itemNo === l.itemNo);
                  return (
                    <tr key={`il-${l.id}`}>
                      <td>{formatDateKst(l.date)}</td>
                      <td className="font-mono text-xs">{l.lotCode}</td>
                      <td>
                        <div>{it?.colorName ?? l.itemNo}</div>
                        <div className="text-[10px] text-ink-500">{l.itemNo}번 · {l.productType}</div>
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(l.actualProducedQty ?? l.completedQty ?? 0)} {it?.unit ?? "개"}</td>
                      <td>{l.assignee}</td>
                      <td className="text-right tabular-nums">{l.actualMaterialTotalCost ? formatCurrency(l.actualMaterialTotalCost) : "—"}</td>
                      <td className="text-ink-600">{l.note}</td>
                    </tr>
                  );
                })}
                {todayFragranceLots.map((l) => (
                  <tr key={`fl-${l.id}`} className="bg-beige-50/30">
                    <td>{formatDateKst(l.productionDate)}</td>
                    <td className="font-mono text-xs">{l.lotNo}</td>
                    <td>
                      <div>[향] {l.fragranceName}</div>
                      <div className="text-[10px] text-ink-500">{l.fragranceCode}</div>
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(l.actualProducedQty)} ml</td>
                    <td>{l.worker}</td>
                    <td className="text-right tabular-nums">{formatCurrency(l.actualMaterialTotalCost)}</td>
                    <td className="text-ink-600">{l.note}</td>
                  </tr>
                ))}
              </>}
        </ReportTable>
      </Section>

      {/* ─── [부족 재고 현황] ────────────────────────────── */}
      <Section title="부족 재고 현황" subtitle="원료재고 + 품목마스터에서 stock ≤ safetyStock인 항목" icon={<AlertTriangle size={14} />}>
        <ReportTable head={["구분","이름","세부","현재재고","안전재고","부족량"]}>
          {lowStock.length === 0
            ? <EmptyRow cols={6} text="모든 재고가 안전 수준 이상입니다." />
            : lowStock.map((r, idx) => {
                const critical = r.gap > r.safety * 0.5;
                return (
                  <tr key={idx} className={critical ? "bg-red-50" : "bg-amber-50/40"}>
                    <td><span className="text-[10px] px-1.5 py-0.5 rounded border bg-bg-panel">{r.kind}</span></td>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-xs text-ink-600">{r.sub}</td>
                    <td className={`text-right tabular-nums ${critical ? "text-red-700 font-semibold" : "text-amber-800"}`}>
                      {formatNumber(r.stock)} {r.unit}
                    </td>
                    <td className="text-right tabular-nums text-ink-600">{formatNumber(r.safety)} {r.unit}</td>
                    <td className={`text-right tabular-nums font-semibold ${critical ? "text-red-700" : "text-amber-800"}`}>
                      −{formatNumber(r.gap)}
                    </td>
                  </tr>
                );
              })
          }
        </ReportTable>
      </Section>

      {/* ─── [오늘 출고 현황] ────────────────────────────── */}
      <Section title="오늘 출고 현황" subtitle="출고이력" icon={<Package size={14} />}>
        <ReportTable head={["구분","출고처","품목","수량","금액","담당자","비고"]}>
          {todayShipments.length === 0
            ? <EmptyRow cols={7} text="오늘 출고된 내역이 없습니다." />
            : todayShipments.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.line === "업사이클"
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">업사이클</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded border bg-beige-100 text-ink-600 border-beige-200">기존</span>}
                  </td>
                  <td className="font-medium">{s.customer}</td>
                  <td>{s.optionName} <span className="text-[10px] text-ink-500">{s.optionCode}</span></td>
                  <td className="text-right tabular-nums">{formatNumber(s.qty)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(s.qty * (s.unitPrice ?? 0))}</td>
                  <td>{s.assignee}</td>
                  <td className="text-ink-600">{s.note}</td>
                </tr>
              ))
          }
        </ReportTable>
      </Section>

      {/* ─── [오늘 원료 입출고] ──────────────────────────── */}
      <Section title="오늘 원료 입출고" subtitle="원료입출고 (입고 · 생산사용 · 폐기 · 재고조정 · 향료 등록)" icon={<ArrowLeftRight size={14} />}>
        <ReportTable head={["유형","원료코드","원료명","수량","단가","총액","LOT","비고"]}>
          {todayTransactions.length === 0
            ? <EmptyRow cols={8} text="오늘 원료 입출고 내역이 없습니다." />
            : todayTransactions.map((t) => {
                const isIn = t.transactionType === "입고";
                const isWaste = t.transactionType === "폐기";
                const isAdj = t.transactionType === "재고조정";
                const toneCls =
                  isIn ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                  isWaste ? "bg-red-50 text-red-800 border-red-200" :
                  isAdj ? "bg-sky-50 text-sky-800 border-sky-200" :
                          "bg-amber-50 text-amber-800 border-amber-200";
                return (
                  <tr key={t.id}>
                    <td>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${toneCls}`}>{t.transactionType}</span>
                    </td>
                    <td className="font-mono text-xs">{t.materialCode || "—"}</td>
                    <td className="font-medium">{t.materialName}</td>
                    <td className={`text-right tabular-nums ${isWaste ? "text-red-700" : ""}`}>
                      {isWaste || t.transactionType === "생산사용" ? "−" : isIn ? "+" : ""}{formatNumber(Math.abs(t.qty))} {t.unit}
                    </td>
                    <td className="text-right tabular-nums">{t.unitCost ? formatCurrency(t.unitCost) : "—"}</td>
                    <td className="text-right tabular-nums">{t.totalCost ? formatCurrency(t.totalCost) : "—"}</td>
                    <td className="font-mono text-xs text-ink-600">{t.lotNo || "—"}</td>
                    <td className="text-ink-600 max-w-[200px] truncate">{isWaste && t.disposalReason ? `[${t.disposalReason}] ` : ""}{t.note}</td>
                  </tr>
                );
              })
          }
        </ReportTable>
      </Section>

      {/* ─── [오늘 사용 원료 TOP] ────────────────────────── */}
      <Section title="오늘 사용 원료 TOP" subtitle="품목생산투입원료 + 향생산투입원료 합산" icon={<Boxes size={14} />}>
        <ReportTable head={["원료명","총 사용량","단위","사용 원가"]}>
          {topUsedMaterials.length === 0
            ? <EmptyRow cols={4} text="오늘 사용된 원료가 없습니다." />
            : topUsedMaterials.map((r, idx) => (
                <tr key={idx}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-right tabular-nums">{formatNumber(r.qty)}</td>
                  <td>{r.unit}</td>
                  <td className="text-right tabular-nums font-medium">{formatCurrency(r.cost)}</td>
                </tr>
              ))
          }
        </ReportTable>
      </Section>

      {/* ─── [향 생산 현황] ──────────────────────────────── */}
      <Section title="향 생산 현황" subtitle="향생산LOT" icon={<FlaskConical size={14} />}>
        <ReportTable head={["향 이름","생산량 (ml)","1ml 원가","LOT 번호","재고 등록"]}>
          {todayFragranceLots.length === 0
            ? <EmptyRow cols={5} text="오늘 향 생산이 없습니다." />
            : todayFragranceLots.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.fragranceName} <span className="text-[10px] text-ink-500">{l.fragranceCode}</span></td>
                  <td className="text-right tabular-nums">{formatNumber(l.actualProducedQty)}</td>
                  <td className="text-right tabular-nums">{formatCurrency(l.actualUnitCost)}</td>
                  <td className="font-mono text-xs">{l.lotNo}</td>
                  <td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      l.inventoryStatus === "사용가능" ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                      l.inventoryStatus === "대기"     ? "bg-amber-50 text-amber-800 border-amber-200" :
                      l.inventoryStatus === "테스트"   ? "bg-sky-50 text-sky-800 border-sky-200" :
                                                          "bg-red-50 text-red-800 border-red-200"
                    }`}>{l.inventoryStatus}</span>
                  </td>
                </tr>
              ))
          }
        </ReportTable>
      </Section>

      {/* ─── [오늘 메모] ─────────────────────────────────── */}
      <Section title="오늘 메모" subtitle="경영진/관리자 코멘트" icon={<FileText size={14} />}>
        <textarea
          value={managerNote}
          onChange={(e) => setManagerNote(e.target.value)}
          placeholder="오늘의 주요 이슈, 결정사항, 의사소통 사항을 자유롭게 작성하세요. 인쇄 시 그대로 출력됩니다."
          className="w-full min-h-[120px] rounded-md border border-border bg-bg-panel p-3 text-sm leading-relaxed focus:outline-none focus:border-beige-400" />
      </Section>

      <div className="mt-8 text-[10px] text-ink-400 text-center print:text-ink-500">
        Generated by Another Day · B.fter Ops — {new Date().toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────
function KpiCard({
  label, value, unit, icon, tone, sub,
}: { label: string; value: string; unit?: string; icon?: React.ReactNode; tone?: "ok" | "warn"; sub?: React.ReactNode }) {
  const toneCls = tone === "warn" ? "border-amber-200" : "border-border";
  return (
    <div className={`rounded-xl border ${toneCls} bg-bg-panel px-3 py-3 shadow-sm`}>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-500 uppercase tracking-wider">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums text-ink-900 leading-tight">
        {value} {unit && <span className="text-[12px] text-ink-500 font-normal">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[10px] text-ink-500 leading-tight">{sub}</div>}
    </div>
  );
}

function Section({
  title, subtitle, icon, children,
}: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="report-section mb-6">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-ink-500">{icon}</span>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        </div>
        {subtitle && <div className="text-[10px] text-ink-500">{subtitle}</div>}
      </div>
      <div className="rounded-xl border border-border bg-bg-panel overflow-hidden shadow-sm">
        {children}
      </div>
    </section>
  );
}

function ReportTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="report-table w-full text-sm">
        <thead>
          <tr>
            {head.map((h) => <th key={h} className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-ink-500 bg-bg-subtle/50 border-b border-border">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-ink-400 py-6 text-xs">{text}</td>
    </tr>
  );
}
