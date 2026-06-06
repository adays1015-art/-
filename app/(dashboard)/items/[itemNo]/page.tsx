import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Boxes, Factory, Layers } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { getItemByNo, listItems } from "@/services/items";
import { listBomForItem } from "@/services/itemBom";
import { listItemLotsByItem } from "@/services/itemProduction";
import { listSetOptions, listSetComposition } from "@/services/setOptions";
import { listFinishedSets } from "@/services/finishedSets";
import { formatDate, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function mapStatus(s: string): "예정" | "진행 중" | "완료" | "보류" {
  if (s === "진행중") return "진행 중";
  if (s === "완료") return "완료";
  if (s === "보류") return "보류";
  return "예정";
}

export default async function ItemDetailPage({ params }: { params: { itemNo: string } }) {
  const itemNo = decodeURIComponent(params.itemNo);
  const item = await getItemByNo(itemNo);
  if (!item) notFound();

  const [bom, lots, opts, comps, allItems, finishedSets] = await Promise.all([
    listBomForItem(itemNo),
    listItemLotsByItem(itemNo),
    listSetOptions(),
    listSetComposition(),
    listItems(),
    listFinishedSets(),
  ]);

  // Sets that contain this item
  const containingSets = comps
    .filter((c) => c.itemNo === itemNo)
    .map((c) => ({ comp: c, option: opts.find((o) => o.id === c.setOptionId) }))
    .filter((x): x is { comp: typeof x.comp; option: NonNullable<typeof x.option> } => !!x.option);

  // Planned demand: for each containing set, count finished-set "reserved" qty
  // as the conservative "사용 예정량" indicator (= reservations × qty-per-set).
  let plannedDemand = 0;
  for (const cs of containingSets) {
    const fs = finishedSets.find((f) => f.optionCode === cs.option.optionCode);
    plannedDemand += (fs?.reserved ?? 0) * cs.comp.qty;
  }

  // Bottleneck check: per containing set, how many sets can be made from current item stock?
  const bottleneck = containingSets.map((cs) => ({
    label: `${cs.option.productType} ${cs.option.setSize} ${cs.option.optionName}`,
    optionCode: cs.option.optionCode,
    qtyPerSet: cs.comp.qty,
    maxSets: Math.floor(item.stock / cs.comp.qty),
  }));

  const recentLots = lots.slice().sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 10);
  const isLow = item.stock < item.safetyStock;

  return (
    <div>
      <div className="text-sm text-ink-500 mb-2">
        <Link href="/items" className="inline-flex items-center gap-1 hover:underline">
          <ArrowLeft size={14} /> 품목 마스터
        </Link>
      </div>
      <PageHeader
        title={`${item.itemNo}번 · ${item.colorName}`}
        description={`${item.productType}`}
      />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">현재 재고</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${isLow ? "text-red-700" : "text-ink-900"}`}>
            {formatNumber(item.stock)} <span className="text-base text-ink-600">{item.unit}</span>
          </div>
          {isLow && (
            <div className="mt-1 text-xs text-red-700 inline-flex items-center gap-1">
              <AlertTriangle size={12} /> 안전재고 {formatNumber(item.safetyStock)} 미달
            </div>
          )}
        </div>
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">사용 예정량</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">
            {formatNumber(plannedDemand)} <span className="text-base text-ink-600">{item.unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-500">예약 출고 × 세트 구성 수량</div>
        </div>
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">부족 예상</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${item.stock < plannedDemand ? "text-red-700" : "text-emerald-700"}`}>
            {item.stock < plannedDemand ? `−${formatNumber(plannedDemand - item.stock)}` : "양호"}
          </div>
          <div className="mt-1 text-[11px] text-ink-500">예정 출고 대비</div>
        </div>
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">세트 포함</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{containingSets.length}개</div>
          <div className="mt-1 text-[11px] text-ink-500">옵션 수</div>
        </div>
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">생산 LOT</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{lots.length}건</div>
          <div className="mt-1 text-[11px] text-ink-500">전체 누적</div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Factory size={14} className="text-ink-500" /> 제조 BOM (1{item.unit}당)
          </div>
          <Table>
            <THead>
              <TR>
                <TH>원료</TH><TH>분류</TH>
                <TH className="text-right">단위당사용량</TH><TH>단위</TH>
              </TR>
            </THead>
            <TBody>
              {bom.length === 0 ? <Empty>BOM 미정의</Empty> :
                bom.map((b) => (
                  <TR key={b.id}>
                    <TD>{b.materialName}</TD>
                    <TD><span className="text-xs px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-ink-700">{b.materialCategory}</span></TD>
                    <TD className="text-right tabular-nums">{formatNumber(b.amountPerUnit)}</TD>
                    <TD>{b.unit}</TD>
                  </TR>
                ))
              }
            </TBody>
          </Table>
          <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-border">
            <Link href="/bom" className="hover:underline">BOM 페이지에서 편집 →</Link>
          </div>
        </div>

        <div className="panel">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Layers size={14} className="text-ink-500" /> 포함된 세트 옵션 · 병목 분석
          </div>
          <Table>
            <THead>
              <TR>
                <TH>세트</TH><TH>옵션코드</TH>
                <TH className="text-right">세트당 수량</TH>
                <TH className="text-right">
                  <span title="가장 부족한 색상 또는 구성품 재고 기준으로 계산됩니다.">현재 조합 가능 재고</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {bottleneck.length === 0 ? <Empty>이 품목이 포함된 세트가 없습니다.</Empty> :
                bottleneck.map((b) => (
                  <TR key={b.optionCode}>
                    <TD>{b.label}</TD>
                    <TD className="font-mono text-xs">{b.optionCode}</TD>
                    <TD className="text-right tabular-nums">×{b.qtyPerSet}</TD>
                    <TD className={`text-right tabular-nums font-semibold ${b.maxSets < 10 ? "text-red-700" : "text-emerald-700"}`}>
                      {formatNumber(b.maxSets)} 세트
                    </TD>
                  </TR>
                ))
              }
            </TBody>
          </Table>
          {bottleneck.some((b) => b.maxSets === 0) && (
            <div className="px-4 py-2 text-[11px] text-red-700 border-t border-border bg-red-50">
              ⚠️ 이 품목이 부족하여 다음 세트 생산이 막힙니다:{" "}
              {bottleneck.filter((b) => b.maxSets === 0).map((b) => b.label).join(", ")}
            </div>
          )}
        </div>
      </section>

      <section className="panel mt-6">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <Boxes size={14} className="text-ink-500" /> 생산 LOT 이력 (최근 10건)
        </div>
        <Table>
          <THead>
            <TR>
              <TH>생산일</TH><TH>LOT</TH>
              <TH className="text-right">목표</TH><TH className="text-right">완료</TH><TH className="text-right">불량</TH>
              <TH>담당자</TH><TH>상태</TH><TH>메모</TH>
            </TR>
          </THead>
          <TBody>
            {recentLots.length === 0 ? <Empty>생산 이력이 없습니다.</Empty> :
              recentLots.map((l) => (
                <TR key={l.id}>
                  <TD>{formatDate(l.date)}</TD>
                  <TD className="font-mono text-xs">{l.lotCode}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(l.targetQty)}</TD>
                  <TD className="text-right tabular-nums">{formatNumber(l.completedQty)}</TD>
                  <TD className="text-right tabular-nums text-red-600">{l.defectQty || ""}</TD>
                  <TD>{l.assignee}</TD>
                  <TD><StatusBadge status={mapStatus(l.status)} /></TD>
                  <TD className="text-ink-600 max-w-[240px] truncate">{l.note}</TD>
                </TR>
              ))
            }
          </TBody>
        </Table>
      </section>

      {/* siblings: other items with the same productType */}
      <section className="panel mt-6">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">
          같은 {item.productType} 품목들
        </div>
        <div className="p-3 flex flex-wrap gap-1.5">
          {allItems
            .filter((x) => x.productType === item.productType)
            .sort((a, b) => Number(a.itemNo) - Number(b.itemNo))
            .map((x) => (
              <Link key={x.id} href={`/items/${x.itemNo}`}
                className={`text-xs px-2 py-1 rounded-md border ${
                  x.itemNo === item.itemNo
                    ? "bg-ink-900 text-bg border-ink-900"
                    : "bg-bg-panel text-ink-700 border-border hover:bg-bg-subtle"
                }`}>
                {x.itemNo} · {x.colorName}
              </Link>
            ))}
        </div>
      </section>
    </div>
  );
}
