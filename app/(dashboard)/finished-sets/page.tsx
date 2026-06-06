import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { listFinishedSets } from "@/services/finishedSets";
import { PRODUCT_TYPES } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinishedSetsPage() {
  const items = await listFinishedSets();
  const byPt = PRODUCT_TYPES.map((t) => ({
    label: t,
    qty: items.filter((i) => i.productType === t).reduce((s, i) => s + i.stock, 0),
  }));
  const totalStock = items.reduce((s, i) => s + i.stock, 0);
  const totalAvailable = items.reduce((s, i) => s + i.available, 0);

  return (
    <div>
      <PageHeader
        title="완제품 세트 재고"
        description="조립이 완료된 판매 가능한 세트 단위 재고. 출고 시 자동 차감됩니다."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">총 재고 (세트)</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{formatNumber(totalStock)}</div>
        </div>
        <div className="panel panel-pad">
          <div className="text-xs text-ink-500 uppercase tracking-wider">가용 재고</div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-emerald-700">{formatNumber(totalAvailable)}</div>
        </div>
        {byPt.map((b) => (
          <div key={b.label} className="panel panel-pad">
            <div className="text-xs text-ink-500 uppercase tracking-wider">{b.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{formatNumber(b.qty)}</div>
          </div>
        ))}
      </div>

      <Table>
        <THead>
          <TR>
            <TH>제품유형</TH><TH>세트유형</TH><TH>옵션명</TH><TH>옵션코드</TH>
            <TH className="text-right">현재 재고</TH><TH className="text-right">예약 출고</TH><TH className="text-right">가용 재고</TH>
            <TH>보관 위치</TH><TH>최근 생산일</TH>
          </TR>
        </THead>
        <TBody>
          {items.length === 0 ? <Empty>등록된 완제품 세트가 없습니다.</Empty> :
            items.map((f) => (
              <TR key={f.id}>
                <TD><span className="text-xs px-1.5 py-0.5 rounded bg-beige-100 text-ink-800 border border-beige-200">{f.productType}</span></TD>
                <TD>{f.setSize}</TD>
                <TD className="font-medium text-ink-900">{f.optionName}</TD>
                <TD className="font-mono text-xs">{f.optionCode}</TD>
                <TD className="text-right tabular-nums">{formatNumber(f.stock)}</TD>
                <TD className="text-right tabular-nums text-ink-600">{formatNumber(f.reserved)}</TD>
                <TD className="text-right tabular-nums font-semibold text-emerald-700">{formatNumber(f.available)}</TD>
                <TD>{f.location}</TD>
                <TD>{formatDate(f.lastProducedAt)}</TD>
              </TR>
            ))
          }
        </TBody>
      </Table>
    </div>
  );
}
