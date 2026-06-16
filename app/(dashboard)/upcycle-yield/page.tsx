import { listSupplierYield } from "@/services/upcycleYield";

export const dynamic = "force-dynamic";

function fmt(n: number, digits = 0) {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export default async function UpcycleYieldPage() {
  const rows = await listSupplierYield();
  const total = rows.reduce(
    (a, r) => ({
      receivedUnits: a.receivedUnits + r.receivedUnits,
      contentWeightG: a.contentWeightG + r.contentWeightG,
      outputUnits: a.outputUnits + r.outputUnits,
    }),
    { receivedUnits: 0, contentWeightG: 0, outputUnits: 0 },
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-ink-900">업사이클 제공처 수율</h1>
        <p className="text-sm text-ink-500 mt-1">
          제공처(폐화장품 준 곳)별 인풋(받은 개수·내용물 무게) 대비 아웃풋(산출 개수)과 수율.
          기타 첨가재료는 제외하고 폐화장품만 집계합니다.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="panel p-6 text-sm text-ink-500">
          아직 집계할 데이터가 없습니다. 업사이클 원료재고에 <b>제공처(공급처)</b>·<b>받은 수량</b>·
          <b>개당 내용물 무게</b>를 입력하고, 업사이클 생산 LOT을 등록하면 여기에 수율이 표시됩니다.
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th text-left">제공처</th>
                <th className="table-th text-right">원료 종류</th>
                <th className="table-th text-right">받은 개수</th>
                <th className="table-th text-right">내용물 총량(g)</th>
                <th className="table-th text-right">생산 투입(g)</th>
                <th className="table-th text-right">산출 개수</th>
                <th className="table-th text-right">수율(개/받은개수)</th>
                <th className="table-th text-right">수율(개/kg)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplier}>
                  <td className="table-td font-medium text-ink-900">{r.supplier}</td>
                  <td className="table-td text-right tabular-nums text-ink-500">{r.materialCount}</td>
                  <td className="table-td text-right tabular-nums">{fmt(r.receivedUnits)}</td>
                  <td className="table-td text-right tabular-nums">{fmt(r.contentWeightG, 1)}</td>
                  <td className="table-td text-right tabular-nums text-ink-500">{fmt(r.consumedG, 1)}</td>
                  <td className="table-td text-right tabular-nums font-semibold">{fmt(r.outputUnits, 2)}</td>
                  <td className="table-td text-right tabular-nums">
                    {r.yieldPerUnit != null ? `${fmt(r.yieldPerUnit * 100, 1)}%` : "—"}
                  </td>
                  <td className="table-td text-right tabular-nums">
                    {r.yieldPerKg != null ? fmt(r.yieldPerKg, 2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="table-td">합계</td>
                <td className="table-td"></td>
                <td className="table-td text-right tabular-nums">{fmt(total.receivedUnits)}</td>
                <td className="table-td text-right tabular-nums">{fmt(total.contentWeightG, 1)}</td>
                <td className="table-td"></td>
                <td className="table-td text-right tabular-nums">{fmt(total.outputUnits, 2)}</td>
                <td className="table-td text-right tabular-nums">
                  {total.receivedUnits > 0 ? `${fmt((total.outputUnits / total.receivedUnits) * 100, 1)}%` : "—"}
                </td>
                <td className="table-td text-right tabular-nums">
                  {total.contentWeightG > 0 ? fmt(total.outputUnits / (total.contentWeightG / 1000), 2) : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
