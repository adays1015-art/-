import PageHeader from "@/components/PageHeader";
import AdminGate from "@/components/AdminGate";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { listHistory } from "@/services/history";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_STYLES: Record<string, string> = {
  "원료 입고":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "원료 차감":  "bg-amber-50 text-amber-700 border-amber-200",
  "품목 생산":  "bg-blue-50 text-blue-700 border-blue-200",
  "품목 입고":  "bg-sky-50 text-sky-700 border-sky-200",
  "세트 조립":  "bg-violet-50 text-violet-700 border-violet-200",
  "세트 입고":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "출고":       "bg-red-50 text-red-700 border-red-200",
  "원가 수정":  "bg-purple-50 text-purple-700 border-purple-200",
  "수정":       "bg-slate-50 text-slate-700 border-slate-200",
};

export default async function HistoryPage() {
  const logs = await listHistory();
  return (
    <AdminGate>
    <div>
      <PageHeader
        title="작업 이력"
        description="원료 입고/차감, 품목 생산/입고, 세트 조립/입고, 출고, 원가 수정 등 모든 운영 동작의 감사 로그."
      />
      <Table>
        <THead>
          <TR>
            <TH>일시</TH><TH>작업유형</TH><TH>대상</TH><TH>변경내용</TH><TH>담당자</TH><TH>메모</TH>
          </TR>
        </THead>
        <TBody>
          {logs.length === 0 ? <Empty>작업 이력이 없습니다.</Empty> :
            logs.map((w) => (
              <TR key={w.id}>
                <TD className="whitespace-nowrap font-mono text-xs">{formatDateTime(w.time)}</TD>
                <TD>
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${TYPE_STYLES[w.type] ?? "bg-bg-subtle border-border text-ink-700"}`}>
                    {w.type}
                  </span>
                </TD>
                <TD>{w.target}</TD>
                <TD className="tabular-nums">{w.change}</TD>
                <TD>{w.assignee}</TD>
                <TD className="text-ink-600">{w.note}</TD>
              </TR>
            ))
          }
        </TBody>
      </Table>
    </div>
    </AdminGate>
  );
}
