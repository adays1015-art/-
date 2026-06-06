"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, AlertTriangle, Boxes, PackagePlus, Factory, Trash2, Wrench, FlaskConical } from "lucide-react";
import type {
  Material, MaterialTransaction,
  ProductionExecutionMaterial, FragranceExecutionMaterial,
} from "@/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { convertQty } from "@/lib/units";

/**
 * Vertical timeline of one material's full deduction + receipt history.
 *
 * Sources merged into a single timeline:
 *   1) 원료입출고 (MaterialTransaction)        — 입고 · 생산사용 · 폐기 · 재고조정
 *   2) 품목생산투입원료 (ProductionExecution)  — 품목생산 사용
 *   3) 향생산투입원료 (FragranceExecution)     — 향생산 사용
 *
 * Production-execution rows record actual stock deductions that happen on
 * the server side during 품목생산LOT save, but they are NOT mirrored as
 * 원료입출고 rows. Reading them alongside is what lets the timeline match
 * the master.stock value the user sees.
 *
 * Read-only. Pure aggregation; no mutation of inputs or sheet writes.
 */
type Kind = "입고" | "생산사용" | "폐기" | "재고조정" | "품목생산 사용" | "향생산 사용";

interface TimelineEvent {
  id: string;
  kind: Kind;
  date: string;            // YYYY-MM-DD for sorting + display
  sortKey: string;         // ISO if available, else date — for stable order
  /** Signed net change expressed in the MATERIAL's storage unit. */
  netChangeInStockUnit: number;
  /** Original quantity & unit from the source row (for display). */
  rawQty: number;
  rawUnit: string;
  // Display extras
  lotNo?: string;
  itemNo?: string;
  fragranceCode?: string;
  manufacturer?: string;
  supplier?: string;
  unitCost?: number;
  totalCost?: number;
  expiryDate?: string;
  capacity?: string;
  disposalReason?: string;
  note?: string;
  /** Whether unit conversion was successful for the running-balance math. */
  unitsCompatible: boolean;
}

export default function MaterialTimeline({
  material, transactions, productionUsage = [], fragranceUsage = [],
}: {
  material: Material;
  transactions: MaterialTransaction[];
  productionUsage?: ProductionExecutionMaterial[];
  fragranceUsage?: FragranceExecutionMaterial[];
}) {
  // Match by ANY of the material's identifying tokens. Different writers
  // historically used different conventions:
  //   - BOM-pick after the unit-normalization change: materialCode
  //   - Older BOM rows / migrated data: material.id (often the synthesized
  //     "M-..." key, used as materialCode by the exec writer)
  //   - Manual /material-transactions entries: any of the above
  // We also fall back to materialName for legacy rows that lost their code.
  const code = (material.materialCode || "").trim();
  const id   = (material.id || "").trim();
  const name = (material.materialName || material.name || "").trim();
  const stockUnit = (material.unit || "").trim();
  function matchMaterial(rowCode: string, rowName: string): boolean {
    const rc = (rowCode || "").trim();
    const rn = (rowName || "").trim();
    if (rc && code && rc === code) return true;
    if (rc && id   && rc === id)   return true;
    if (!rc && rn && name && rn === name) return true;  // name fallback only when no code
    return false;
  }

  // Build a unified event list. All deductions are normalized into the
  // material's storage unit via convertQty so running balance matches stock.
  const events: TimelineEvent[] = useMemo(() => {
    const out: TimelineEvent[] = [];

    // ─── 원료입출고 ─────────────────────────────────────────
    for (const t of transactions) {
      if (!matchMaterial(t.materialCode, t.materialName)) continue;
      const conv = convertQty(t.qty, t.unit, stockUnit);
      const sign =
        t.transactionType === "입고" ? +1 :
        t.transactionType === "재고조정" ? +1 :   // signed by user already
        -1;                                        // 생산사용 / 폐기
      const net = sign * (conv.compatible ? conv.qty : t.qty);
      out.push({
        id: t.id,
        kind: t.transactionType,
        date: (t.transactionDate || t.createdAt || "").slice(0, 10),
        sortKey: t.createdAt || t.transactionDate || "",
        netChangeInStockUnit: net,
        rawQty: t.qty,
        rawUnit: t.unit,
        lotNo: t.lotNo,
        manufacturer: t.manufacturer,
        supplier: t.supplier,
        unitCost: t.unitCost,
        totalCost: t.totalCost,
        expiryDate: t.expiryDate,
        capacity: t.capacity,
        disposalReason: t.disposalReason,
        note: t.note,
        unitsCompatible: conv.compatible,
      });
    }

    // ─── 품목생산투입원료 ───────────────────────────────────
    for (const e of productionUsage) {
      if (!matchMaterial(e.materialCode, e.materialName)) continue;
      const conv = convertQty(e.actualQty, e.unit, stockUnit);
      out.push({
        id: e.id,
        kind: "품목생산 사용",
        date: (e.createdAt || "").slice(0, 10),
        sortKey: e.createdAt || "",
        netChangeInStockUnit: -(conv.compatible ? conv.qty : e.actualQty),
        rawQty: e.actualQty,
        rawUnit: e.unit,
        lotNo: e.lotNo,
        itemNo: e.itemNo,
        unitCost: e.unitCost,
        totalCost: e.materialCost,
        note: e.note,
        unitsCompatible: conv.compatible,
      });
    }

    // ─── 향생산투입원료 ─────────────────────────────────────
    for (const e of fragranceUsage) {
      if (!matchMaterial(e.materialCode, e.materialName)) continue;
      const conv = convertQty(e.actualQty, e.unit, stockUnit);
      out.push({
        id: e.id,
        kind: "향생산 사용",
        date: (e.createdAt || "").slice(0, 10),
        sortKey: e.createdAt || "",
        netChangeInStockUnit: -(conv.compatible ? conv.qty : e.actualQty),
        rawQty: e.actualQty,
        rawUnit: e.unit,
        lotNo: e.lotNo,
        fragranceCode: e.fragranceCode,
        unitCost: e.unitCost,
        totalCost: e.materialCost,
        unitsCompatible: conv.compatible,
      });
    }

    // Newest first. Use sortKey (ISO) when both have one, else date.
    out.sort((a, b) => {
      const ak = a.sortKey || a.date;
      const bk = b.sortKey || b.date;
      return bk.localeCompare(ak);
    });
    return out;
  }, [code, id, name, stockUnit, transactions, productionUsage, fragranceUsage]);

  // Running balance reconstruction.
  type Enriched = TimelineEvent & { before: number; after: number };
  const enriched: Enriched[] = useMemo(() => {
    let running = material.stock;
    const out: Enriched[] = [];
    for (const ev of events) {
      const after = running;
      const before = after - ev.netChangeInStockUnit;
      out.push({ ...ev, before, after });
      running = before;
    }
    return out;
  }, [events, material.stock]);

  const earliestBefore = enriched.length ? enriched[enriched.length - 1].before : material.stock;
  const isApproximate = earliestBefore < -1e-9;

  // Summary cards. "총 사용" now includes 생산사용 (from 원료입출고) AND
  // 품목생산 사용 (from 품목생산투입원료) AND 향생산 사용.
  const totals = useMemo(() => {
    let inflow = 0, used = 0, disposed = 0, adjusted = 0;
    let prodCount = 0, fragCount = 0;
    for (const ev of events) {
      const q = Math.abs(ev.netChangeInStockUnit);
      switch (ev.kind) {
        case "입고":         inflow   += q; break;
        case "생산사용":     used     += q; break;
        case "폐기":         disposed += q; break;
        case "재고조정":     adjusted += ev.netChangeInStockUnit; break;
        case "품목생산 사용": used     += q; prodCount += 1; break;
        case "향생산 사용":   used     += q; fragCount += 1; break;
      }
    }
    return { inflow, used, disposed, adjusted, prodCount, fragCount };
  }, [events]);

  // ─── Match diagnostics (temporary, in-page) ─────────────
  const prodMatched = productionUsage.filter((e) => matchMaterial(e.materialCode, e.materialName));
  const fragMatched = fragranceUsage.filter((e) => matchMaterial(e.materialCode, e.materialName));
  const sampleProdCodes = productionUsage.slice(0, 3).map((e) => e.materialCode || "(empty)").join(", ");

  return (
    <div>
      <div className="mb-3 rounded-md border border-dashed border-ink-300 bg-bg-subtle/40 px-3 py-2 text-[11px] text-ink-700 font-mono leading-relaxed">
        <div className="text-ink-900 font-semibold mb-1">[debug] timeline 매칭</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span>material.materialCode = <b>{code || "(empty)"}</b></span>
          <span>material.id = <b>{id || "(empty)"}</b></span>
          <span>material.name = <b>{name || "(empty)"}</b></span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          <span>품목생산투입원료: <b className={prodMatched.length > 0 ? "text-emerald-700" : "text-amber-700"}>{prodMatched.length}</b> / {productionUsage.length}</span>
          <span>향생산투입원료: <b className={fragMatched.length > 0 ? "text-emerald-700" : "text-amber-700"}>{fragMatched.length}</b> / {fragranceUsage.length}</span>
          <span>원료입출고: <b>{transactions.length}</b> raw</span>
        </div>
        {productionUsage.length > 0 && prodMatched.length === 0 && (
          <div className="mt-1 text-amber-800">
            ⚠ 매칭된 품목생산 사용이 없습니다. exec 첫 3개 materialCode: <b>{sampleProdCodes}</b>
            {" — "}현재 매칭 키 ({code || id || name}) 와 일치하지 않습니다.
          </div>
        )}
        {prodMatched.length > 0 && (
          <div className="mt-1 text-emerald-800">
            매칭 샘플: {prodMatched.slice(0, 3).map((e) => `${e.materialCode || "(empty)"}/${e.lotNo}`).join(" · ")}
          </div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="총 입고" value={`+${formatNumber(totals.inflow)} ${stockUnit}`} tone="ok" icon={<PackagePlus size={14} />} />
        <SummaryCard
          label="총 사용"
          value={`−${formatNumber(totals.used)} ${stockUnit}`}
          tone="info"
          icon={<Factory size={14} />}
          hint={totals.prodCount + totals.fragCount > 0
            ? `품목생산 ${totals.prodCount}건 + 향생산 ${totals.fragCount}건 포함`
            : undefined}
        />
        <SummaryCard label="총 폐기" value={`−${formatNumber(totals.disposed)} ${stockUnit}`} tone={totals.disposed > 0 ? "warn" : "muted"} icon={<Trash2 size={14} />} />
        <SummaryCard label="현재 재고" value={`${formatNumber(material.stock)} ${stockUnit}`} tone="primary" icon={<Boxes size={14} />} />
      </div>

      {isApproximate && (
        <div className="mb-4 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            현재 기록 기준 추정 재고 — 일부 기록이 누락되었거나 초기 재고가 거래 기록 전에 등록된 것으로 보입니다.
            (가장 오래된 기록 직전 추정 재고: {formatNumber(earliestBefore)} {stockUnit})
          </span>
        </div>
      )}

      {totals.adjusted !== 0 && (
        <div className="mb-4 text-[11px] text-ink-600 bg-bg-subtle border border-border rounded-md px-3 py-1.5">
          재고조정 누계: <b className="text-ink-900">{totals.adjusted > 0 ? "+" : ""}{formatNumber(totals.adjusted)} {stockUnit}</b>
        </div>
      )}

      {enriched.length === 0 ? (
        <div className="text-center py-10 text-sm text-ink-500">
          이 원료의 입출고 / 생산 사용 기록이 아직 없습니다.
        </div>
      ) : (
        <ol className="relative border-l-2 border-border ml-3 space-y-4">
          {enriched.map((ev) => {
            const meta = kindChip(ev.kind);
            const dec = ev.netChangeInStockUnit < 0;
            const inc = ev.netChangeInStockUnit > 0;
            return (
              <li key={`${ev.kind}-${ev.id}`} className="ml-5">
                <div className={`absolute -left-[9px] mt-1.5 w-4 h-4 rounded-full border-2 border-bg-panel ${meta.dotCls}`} />
                <div className="rounded-md border border-border bg-bg-panel p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.chipCls}`}>{ev.kind}</span>
                    <span className="text-sm font-semibold text-ink-900 tabular-nums">
                      {inc && <ArrowUp size={11} className="inline text-emerald-700 mr-0.5" />}
                      {dec && <ArrowDown size={11} className="inline text-red-700 mr-0.5" />}
                      {ev.netChangeInStockUnit > 0 ? "+" : ""}{formatNumber(ev.netChangeInStockUnit)} {stockUnit}
                      {ev.rawUnit && ev.rawUnit !== stockUnit && (
                        <span className="ml-1 text-[10px] text-ink-500 font-normal">
                          (원: {formatNumber(ev.rawQty)} {ev.rawUnit}{!ev.unitsCompatible ? " · 단위 불일치" : ""})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-ink-500 tabular-nums ml-auto">
                      이전 {formatNumber(ev.before)} → <b className="text-ink-900">이후 {formatNumber(ev.after)}</b>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-ink-600">
                    <span className="font-mono">{formatDate(ev.date)}</span>
                    {ev.itemNo && <span>품목 <span className="font-mono">{ev.itemNo}번</span></span>}
                    {ev.fragranceCode && <span><FlaskConical size={10} className="inline" /> 향 <span className="font-mono">{ev.fragranceCode}</span></span>}
                    {ev.unitCost ? <span>단가 {formatCurrency(ev.unitCost)}</span> : null}
                    {ev.totalCost ? <span>총액 {formatCurrency(ev.totalCost)}</span> : null}
                    {ev.manufacturer && <span>제조: {ev.manufacturer}</span>}
                    {ev.supplier && <span>공급: {ev.supplier}</span>}
                    {ev.lotNo && <span>LOT <span className="font-mono">{ev.lotNo}</span></span>}
                    {ev.expiryDate && <span>유통기한 {formatDate(ev.expiryDate)}</span>}
                    {ev.capacity && <span>용량 {ev.capacity}</span>}
                  </div>
                  {(ev.disposalReason || ev.note) && (
                    <div className="mt-1.5 text-[11px] leading-relaxed">
                      {ev.disposalReason && (
                        <div className="text-red-800"><Wrench size={10} className="inline mr-0.5" />폐기사유: {ev.disposalReason}</div>
                      )}
                      {ev.note && <div className="text-ink-700">{ev.note}</div>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────
function kindChip(kind: Kind): { chipCls: string; dotCls: string } {
  switch (kind) {
    case "입고":         return { chipCls: "bg-emerald-50 text-emerald-800 border-emerald-200", dotCls: "bg-emerald-500" };
    case "생산사용":     return { chipCls: "bg-sky-50 text-sky-800 border-sky-200",             dotCls: "bg-sky-500" };
    case "폐기":         return { chipCls: "bg-red-50 text-red-800 border-red-200",             dotCls: "bg-red-500" };
    case "재고조정":     return { chipCls: "bg-bg-subtle text-ink-700 border-border",           dotCls: "bg-ink-400" };
    case "품목생산 사용": return { chipCls: "bg-indigo-50 text-indigo-800 border-indigo-200",   dotCls: "bg-indigo-500" };
    case "향생산 사용":   return { chipCls: "bg-violet-50 text-violet-800 border-violet-200",   dotCls: "bg-violet-500" };
    default:             return { chipCls: "bg-bg-subtle text-ink-700 border-border",           dotCls: "bg-ink-400" };
  }
}

function SummaryCard({
  label, value, tone, icon, hint,
}: {
  label: string; value: string;
  tone: "ok" | "info" | "warn" | "muted" | "primary";
  icon?: React.ReactNode;
  hint?: string;
}) {
  const cls =
    tone === "ok"      ? "border-emerald-200 bg-emerald-50/40" :
    tone === "info"    ? "border-sky-200 bg-sky-50/40" :
    tone === "warn"    ? "border-amber-200 bg-amber-50/40" :
    tone === "primary" ? "border-ink-900 bg-ink-900 text-bg" :
                         "border-border bg-bg-panel";
  const labelCls = tone === "primary" ? "opacity-80" : "text-ink-500";
  return (
    <div className={`rounded-md border ${cls} px-3 py-2`}>
      <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${labelCls}`}>
        {icon} <span>{label}</span>
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className={`text-[10px] mt-0.5 ${tone === "primary" ? "opacity-70" : "text-ink-500"}`}>{hint}</div>}
    </div>
  );
}
