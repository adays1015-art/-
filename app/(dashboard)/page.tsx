import Link from "next/link";
import {
  AlertTriangle, Boxes, Truck, Package, Tag, Sparkles, Factory,
} from "lucide-react";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import { listMaterials } from "@/services/materials";
import { listItems } from "@/services/items";
import { listItemLots } from "@/services/itemProduction";
import { listExecutionMaterials } from "@/services/productionExecution";
import { listBom } from "@/services/itemBom";
import { listFinishedSets } from "@/services/finishedSets";
import { listShipments } from "@/services/shipments";
import { listSetComposition, listSetOptions } from "@/services/setOptions";
import { listFragranceLots, listFragranceExecution } from "@/services/fragranceProduction";
import {
  materialCostForItemNo, aggregateActualCostByItem, pickAppliedUnitCost,
} from "@/lib/costMath";
import { formatCurrency, formatDateKst, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [
    materials, items, itemLots, executionMaterials, bom,
    finishedSets, shipments, comps, opts,
    fragranceLots, fragranceExec,
  ] = await Promise.all([
    listMaterials(),
    listItems(),
    listItemLots(),
    listExecutionMaterials(),
    listBom(),
    listFinishedSets(),
    listShipments(),
    listSetComposition(),
    listSetOptions(),
    listFragranceLots(),
    listFragranceExecution(),
  ]);

  // ─── 1. 부족 카드 데이터 ─────────────────────────────────
  // 부족한 제품 = item.stock < safetyStock (사용중만 카운트)
  const lowItems = items.filter(
    (i) => i.status === "사용중" && i.stock < i.safetyStock,
  );
  // 향료 카테고리 분리 — 향료는 별도 카드로.
  const isFragranceMaterial = (m: typeof materials[number]) => m.category === "향료";
  const lowRawMaterials = materials.filter(
    (m) => !isFragranceMaterial(m) && m.stock < m.safetyStock,
  );
  const lowFragranceMaterials = materials.filter(
    (m) => isFragranceMaterial(m) && m.stock < m.safetyStock,
  );

  // ─── 2. 운영 요약 데이터 (최근 7일 기준) ──────────────────
  // 오해 방지: 대시보드 운영 요약은 "오늘"이 아니라 최근 7일 기준으로 집계.
  const cutoff7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  // 생산 품목 수 = 최근 7일 내 완료 LOT가 있는 distinct itemNo 개수
  const completedItemLots = itemLots.filter((l) => l.status === "완료");
  const recentCompletedItemLots = completedItemLots.filter(
    (l) => (l.date ?? "") >= cutoff7,
  );
  const producedItemNos = Array.from(
    new Set(recentCompletedItemLots.map((l) => l.itemNo).filter(Boolean)),
  ).sort((a, b) => Number(a) - Number(b));
  // 생산 향료 수 = 최근 7일 완료 향 LOT의 distinct fragranceCode
  const completedFragranceLots = fragranceLots.filter(
    (l) => (l.status ?? (l.inventoryStatus === "사용가능" ? "완료" : "")) === "완료",
  );
  const recentCompletedFragranceLots = completedFragranceLots.filter(
    (l) => (l.productionDate ?? "") >= cutoff7,
  );
  const producedFragranceCodes = Array.from(
    new Set(recentCompletedFragranceLots.map((l) => l.fragranceCode).filter(Boolean)),
  );
  // 출고 총액 = Σ(세트 적용 1개 원가 × 출고수량). 세트 적용 원가는
  // 구성품 itemNo의 4-tier 적용 1개 원가 합산. 절대 재고 전체 × 가격 X.
  // 사전 계산: itemNo → 적용 1개 원가 (구성품에 등장하는 itemNo 만)
  // 전체 items 순회 시 O(N×M) 비용이 너무 큼 — composition 에 쓰이는
  // itemNo 만 계산하면 대시보드 진입 시간 단축.
  const itemsInComp = new Set(comps.map((c) => c.itemNo).filter(Boolean));
  const appliedByItemNo = new Map<string, number>();
  for (const it of items) {
    if (!itemsInComp.has(it.itemNo)) continue;
    const bomPerUnit = materialCostForItemNo(it.itemNo, bom, materials).perUnit;
    const agg = aggregateActualCostByItem(it.itemNo, itemLots, executionMaterials, materials, bom);
    const applied = pickAppliedUnitCost({
      latestLotCost: agg.latestLotCost,
      weightedAverageCost: agg.weightedAverageCost,
      bomTotalCost: bomPerUnit,
      currentStock: Number(it.stock) || 0,
    });
    appliedByItemNo.set(it.itemNo, applied.cost);
  }
  // 사전 계산: setOptionCode → 세트 1개 원가
  const setCostByOptionCode = new Map<string, number>();
  for (const opt of opts) {
    const compsForOpt = comps.filter((c) => c.setOptionId === opt.id);
    let setCost = 0;
    for (const c of compsForOpt) {
      const u = appliedByItemNo.get(c.itemNo) ?? 0;
      // composition.qty는 그대로 사용 (실제 세트 구성). 단, 세트 계산기처럼
      // 색상별 1개 가정이 아니라 출고용에서는 실제 구성수량을 곱한다.
      setCost += u * (c.qty || 1);
    }
    if (opt.optionCode) setCostByOptionCode.set(opt.optionCode, setCost);
  }
  // 최근 7일 출고만 집계 (대시보드 운영 요약 = 최근 7일 기준)
  const recentWeekShipments = shipments.filter((s) => (s.date ?? "") >= cutoff7);
  const shipmentTotalAmount = recentWeekShipments.reduce((sum, s) => {
    const setCost = setCostByOptionCode.get(s.optionCode) ?? 0;
    return sum + setCost * (s.qty || 0);
  }, 0);

  // ─── 3. 많이 사용되는 품목 ──────────────────────────────
  // 기준: 최근 30일 출고 세트의 구성품 사용량 + 최근 30일 LOT 생산 빈도 가중치
  const today = new Date();
  const cutoff = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const usageByItem = new Map<string, { shipUsage: number; lotCount: number }>();
  for (const s of shipments) {
    if (s.date < cutoff) continue;
    const opt = opts.find((o) => o.optionCode === s.optionCode);
    if (!opt) continue;
    const compsForOpt = comps.filter((c) => c.setOptionId === opt.id);
    for (const c of compsForOpt) {
      const cur = usageByItem.get(c.itemNo) ?? { shipUsage: 0, lotCount: 0 };
      cur.shipUsage += (c.qty || 1) * (s.qty || 0);
      usageByItem.set(c.itemNo, cur);
    }
  }
  for (const l of completedItemLots) {
    if (l.date < cutoff) continue;
    const cur = usageByItem.get(l.itemNo) ?? { shipUsage: 0, lotCount: 0 };
    cur.lotCount += 1;
    usageByItem.set(l.itemNo, cur);
  }
  const topItems = Array.from(usageByItem.entries())
    .map(([itemNo, v]) => ({
      itemNo,
      shipUsage: v.shipUsage,
      lotCount: v.lotCount,
      score: v.shipUsage + v.lotCount * 5,  // 가중치
      item: items.find((i) => i.itemNo === itemNo),
    }))
    .filter((r) => r.item && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  // ─── 4. 많이 사용되는 향료 ──────────────────────────────
  // 기준: 향 생산 LOT의 fragranceCode 빈도 + 사용량 (actualProducedQty 합산)
  // + 품목생산투입원료 중 category="향료" materialCode 사용량
  const fragranceUsage = new Map<string, { name: string; lotCount: number; producedQty: number; consumedQty: number }>();
  for (const l of completedFragranceLots) {
    const key = l.fragranceCode || l.fragranceName;
    if (!key) continue;
    const cur = fragranceUsage.get(key) ?? { name: l.fragranceName || key, lotCount: 0, producedQty: 0, consumedQty: 0 };
    cur.lotCount += 1;
    cur.producedQty += l.actualProducedQty || 0;
    fragranceUsage.set(key, cur);
  }
  // 품목생산투입원료 중 향료 카테고리 소비량
  for (const e of executionMaterials) {
    const mat = materials.find((m) => m.materialCode === e.materialCode || m.id === e.materialCode);
    if (!mat || mat.category !== "향료") continue;
    const key = mat.materialCode || mat.id;
    const cur = fragranceUsage.get(key) ?? { name: mat.name || key, lotCount: 0, producedQty: 0, consumedQty: 0 };
    cur.consumedQty += e.actualQty || 0;
    fragranceUsage.set(key, cur);
  }
  const topFragrances = Array.from(fragranceUsage.entries())
    .map(([code, v]) => ({ code, ...v, score: v.lotCount * 100 + v.consumedQty + v.producedQty / 10 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // ─── 5. 곧 소진 예상 원료 ───────────────────────────────
  // 기준: stock / safetyStock 비율로 위험도 산정
  //   < 0.5  → 위험
  //   < 1.0  → 주의
  //   < 1.5  → 곧 주의 (보더라인만 표시; 정상은 제외)
  const soonOutMaterials = materials
    .filter((m) => m.safetyStock > 0 && m.stock < m.safetyStock * 1.5)
    .map((m) => {
      const ratio = m.safetyStock > 0 ? m.stock / m.safetyStock : 0;
      const risk: "위험" | "주의" | "곧 주의" =
        ratio < 0.5 ? "위험" : ratio < 1 ? "주의" : "곧 주의";
      return { material: m, ratio, risk };
    })
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 8);

  // ─── 6. 출고 제품 (최근 7일 우선) ───────────────────────
  const recentShipments = recentWeekShipments.slice(0, 30);

  // ─── Header summary value formatters ────────────────────
  const producedItemNoPreview =
    producedItemNos.length === 0
      ? "—"
      : producedItemNos.length <= 3
        ? producedItemNos.join(", ")
        : `${producedItemNos.slice(0, 3).join(", ")} 외 ${producedItemNos.length - 3}`;
  const producedFragrancePreview =
    recentCompletedFragranceLots.length === 0
      ? "—"
      : (() => {
          const names = Array.from(
            new Set(recentCompletedFragranceLots.map((l) => l.fragranceName).filter(Boolean)),
          );
          return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} 외 ${names.length - 2}`;
        })();

  return (
    <div>
      <PageHeader
        title="대시보드"
        description="최근 7일 운영 현황 — 부족 알림 · 운영 요약 · 사용량 상위 · 소진 예상 · 출고"
      />

      {/* ─── 1. 상단 핵심 부족 알림 카드 ───────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="부족한 제품"
          value={`${lowItems.length}개`}
          hint={lowItems.length
            ? `${lowItems[0].itemNo}번 · ${lowItems[0].colorName}${lowItems.length > 1 ? ` 외 ${lowItems.length - 1}` : ""}`
            : "안정"}
          icon={<Tag size={18} />}
          tone={lowItems.length ? "warning" : "default"}
        />
        <StatCard
          label="부족한 원료"
          value={`${lowRawMaterials.length}개`}
          hint={lowRawMaterials.length
            ? `${lowRawMaterials[0].name}${lowRawMaterials.length > 1 ? ` 외 ${lowRawMaterials.length - 1}` : ""}`
            : "안정"}
          icon={<AlertTriangle size={18} />}
          tone={lowRawMaterials.length ? "warning" : "default"}
        />
        <StatCard
          label="부족한 향료"
          value={`${lowFragranceMaterials.length}개`}
          hint={lowFragranceMaterials.length
            ? `${lowFragranceMaterials[0].name}${lowFragranceMaterials.length > 1 ? ` 외 ${lowFragranceMaterials.length - 1}` : ""}`
            : "안정"}
          icon={<Sparkles size={18} />}
          tone={lowFragranceMaterials.length ? "warning" : "default"}
        />
      </section>

      {/* ─── 2. 운영 요약 카드 ──────────────────────────────
          품목번호는 별도 카드가 아닌 "생산 품목" 카드의 보조 텍스트로 통합. */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <StatCard
          label="생산 품목 (최근 7일)"
          value={`${producedItemNos.length}종`}
          hint={producedItemNos.length > 0 ? producedItemNoPreview : "최근 7일 완료 LOT 없음"}
          icon={<Factory size={18} />}
        />
        <StatCard
          label="출고 총액 (최근 7일)"
          value={formatCurrency(shipmentTotalAmount)}
          hint={`최근 7일 출고 ${recentWeekShipments.length}건 · 전체 ${shipments.length}건`}
          icon={<Truck size={18} />}
        />
        <StatCard
          label="생산 향료 (최근 7일)"
          value={`${producedFragranceCodes.length}종`}
          hint={producedFragranceCodes.length > 0 ? producedFragrancePreview : "최근 7일 완료 LOT 없음"}
          icon={<Sparkles size={18} />}
        />
      </section>

      {/* ─── 3. 많이 사용되는 품목 / 4. 많이 사용되는 향료 ───── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
        <div className="panel panel-pad">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-900 tracking-tight">많이 사용되는 품목</h2>
            <span className="text-[11px] text-ink-500">최근 30일 출고 + 생산 빈도</span>
          </div>
          {topItems.length === 0 ? (
            <div className="text-sm text-ink-500 py-8 text-center">최근 30일 사용 기록이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topItems.map((t) => (
                <Link
                  key={t.itemNo}
                  href={`/items/${t.itemNo}`}
                  className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-bg-subtle/40 hover:bg-bg-subtle"
                >
                  <span className="font-mono text-sm font-semibold text-ink-900 w-12">{t.itemNo}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900 truncate">
                      {t.item?.colorName ?? "-"}
                      <span className="text-[10px] text-ink-500 ml-1">({t.item?.productType ?? ""})</span>
                    </div>
                    <div className="text-[11px] text-ink-500">
                      출고 사용 {formatNumber(t.shipUsage)}개 · 생산 LOT {t.lotCount}건
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-ink-700 tabular-nums">재고 {formatNumber(t.item?.stock ?? 0)}{t.item?.unit ?? ""}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel panel-pad">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-900 tracking-tight">많이 사용되는 향료</h2>
            <span className="text-[11px] text-ink-500">향 생산 + 품목 투입 기준</span>
          </div>
          {topFragrances.length === 0 ? (
            <div className="text-sm text-ink-500 py-8 text-center">향료 사용 기록이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {topFragrances.map((f) => (
                <div key={f.code} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2 bg-bg-subtle/40">
                  <Sparkles size={14} className="text-ink-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-900 truncate">{f.name}</div>
                    <div className="text-[11px] text-ink-500 font-mono">{f.code}</div>
                  </div>
                  <div className="text-right text-[11px] text-ink-700 tabular-nums whitespace-nowrap">
                    {f.lotCount > 0 && <div>향 LOT {f.lotCount}건</div>}
                    {f.producedQty > 0 && <div className="text-ink-500">생산 {formatNumber(f.producedQty)}ml</div>}
                    {f.consumedQty > 0 && <div className="text-ink-500">투입 {formatNumber(f.consumedQty)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── 5. 곧 소진 예상 원료 ─────────────────────────── */}
      <section className="panel panel-pad mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink-900 tracking-tight flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-600" /> 곧 재료 소진 예상 원료
          </h2>
          <Link href="/materials" className="text-xs text-beige-600 hover:underline">원료 마스터 →</Link>
        </div>
        {soonOutMaterials.length === 0 ? (
          <div className="text-sm text-ink-500 py-8 text-center">모든 원료가 안전재고 이상입니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">원료명</th>
                  <th className="table-th text-right">현재고</th>
                  <th className="table-th text-right">안전재고</th>
                  <th className="table-th">위험도</th>
                </tr>
              </thead>
              <tbody>
                {soonOutMaterials.map((r) => {
                  const chip =
                    r.risk === "위험" ? "bg-red-50 text-red-800 border-red-300" :
                    r.risk === "주의" ? "bg-amber-50 text-amber-800 border-amber-300" :
                    "bg-bg-subtle text-ink-700 border-border";
                  return (
                    <tr key={r.material.id}>
                      <td className="table-td">
                        <div className="font-medium text-ink-900">{r.material.name}</div>
                        <div className="text-[11px] text-ink-500">{r.material.category}</div>
                      </td>
                      <td className="table-td text-right tabular-nums">
                        {formatNumber(r.material.stock)} <span className="text-[10px] text-ink-500">{r.material.unit}</span>
                      </td>
                      <td className="table-td text-right tabular-nums text-ink-500">
                        {formatNumber(r.material.safetyStock)}
                      </td>
                      <td className="table-td">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${chip}`}>{r.risk}</span>
                        <span className="ml-2 text-[10px] text-ink-500 font-mono">{(r.ratio * 100).toFixed(0)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── 6. 출고 제품 ─────────────────────────────────── */}
      <section className="panel panel-pad mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink-900 tracking-tight flex items-center gap-2">
            <Truck size={14} /> 출고 제품 <span className="text-[11px] font-normal text-ink-500">(최근 7일)</span>
          </h2>
          <Link href="/shipments" className="text-xs text-beige-600 hover:underline">출고 관리 →</Link>
        </div>
        {recentShipments.length === 0 ? (
          <div className="text-sm text-ink-500 py-8 text-center">최근 7일 출고 기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">출고일</th>
                  <th className="table-th">옵션코드</th>
                  <th className="table-th">제품명</th>
                  <th className="table-th text-right">수량</th>
                  <th className="table-th text-right">출고금액 (추정)</th>
                  <th className="table-th">거래처</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => {
                  const setCost = setCostByOptionCode.get(s.optionCode) ?? 0;
                  const amount = setCost * (s.qty || 0);
                  return (
                    <tr key={s.id}>
                      <td className="table-td font-mono text-xs">{formatDateKst(s.date)}</td>
                      <td className="table-td font-mono text-xs">{s.optionCode}</td>
                      <td className="table-td">
                        {s.productType} {s.setSize} {s.optionName}
                      </td>
                      <td className="table-td text-right tabular-nums">{formatNumber(s.qty)}세트</td>
                      <td className="table-td text-right tabular-nums">
                        {amount > 0 ? formatCurrency(amount) : <span className="text-ink-400">—</span>}
                      </td>
                      <td className="table-td text-[11px] text-ink-700">{s.customer || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-1 py-2 text-[11px] text-ink-500 leading-relaxed">
          출고금액은 세트 구성품 적용 1개 원가의 합 × 출고수량으로 추정한 값입니다.
          판매가가 별도 관리되면 그 값을 우선해주세요.
        </div>
      </section>

      <div className="mt-6 text-[11px] text-ink-400">
        최근 작업 이력 · 작업자별 생산 로그는 별도 페이지에서 확인하세요.
        {" "}<Link href="/history" className="underline hover:text-ink-700">/history</Link>
        {" · "}<Link href="/daily-report" className="underline hover:text-ink-700">/daily-report</Link>
      </div>

      <div className="mt-2">
        <Link href="/finished-sets" className="text-[11px] text-ink-400 hover:text-ink-700">
          완제품 세트 재고 ({formatNumber(finishedSets.reduce((s, f) => s + f.stock, 0))}세트 · {finishedSets.length}개 옵션) →
        </Link>
      </div>

      <div className="mt-2">
        <Link href="/materials" className="text-[11px] text-ink-400 hover:text-ink-700">
          원료 종류 {materials.length}종 <Boxes size={11} className="inline" />
        </Link>
        <Link href="/finished-sets" className="ml-3 text-[11px] text-ink-400 hover:text-ink-700">
          완제품 옵션 {finishedSets.length}개 <Package size={11} className="inline" />
        </Link>
      </div>
    </div>
  );
}
