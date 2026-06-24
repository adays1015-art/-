import { listCharges } from "@/services/charges";
import StatCard from "@/components/StatCard";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { balanceOf, paidTotal, statusOf, STATUS_TONE } from "@/lib/charge";
import { formatWon, todayISO } from "@/lib/utils";
import { Wallet, TrendingUp, AlertTriangle, CircleDollarSign } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const charges = await listCharges();
  const today = todayISO();

  const totalCharged = charges.reduce((s, c) => s + (c.amount || 0), 0);
  const totalPaid = charges.reduce((s, c) => s + paidTotal(c), 0);
  const totalBalance = charges.reduce((s, c) => s + balanceOf(c), 0);
  const overdueCount = charges.filter((c) => statusOf(c, today) === "연체").length;

  // 거래처별 미수 집계 (잔액 > 0)
  const byClient = new Map<string, number>();
  for (const c of charges) {
    const b = balanceOf(c);
    if (b > 0) byClient.set(c.clientName, (byClient.get(c.clientName) ?? 0) + b);
  }
  const topDebtors = Array.from(byClient.entries())
    .map(([name, balance]) => ({ name, balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  // 최근 수금
  const recentPayments = charges
    .flatMap((c) => (c.payments ?? []).map((p) => ({ ...p, clientName: c.clientName, title: c.title })))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 6);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-900 tracking-tight">대시보드</h1>
        <p className="text-sm text-ink-600 mt-1">청구·수금 현황 요약 ({today} 기준)</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="총 청구액" value={formatWon(totalCharged)} icon={<Wallet size={16} />} />
        <StatCard label="총 수금액" value={formatWon(totalPaid)} tone="success" icon={<TrendingUp size={16} />} />
        <StatCard label="총 미수금" value={formatWon(totalBalance)} tone="danger" icon={<CircleDollarSign size={16} />}
          hint={totalCharged > 0 ? `수금률 ${Math.round((totalPaid / totalCharged) * 100)}%` : undefined} />
        <StatCard label="연체 건수" value={`${overdueCount}건`} tone={overdueCount ? "warning" : "default"}
          icon={<AlertTriangle size={16} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 미수 상위 거래처 */}
        <div>
          <h2 className="text-sm font-semibold text-ink-700 mb-2">미수금 상위 거래처</h2>
          <Table>
            <THead>
              <TR><TH>거래처</TH><TH className="text-right">미수금</TH></TR>
            </THead>
            <TBody>
              {topDebtors.length === 0 ? (
                <TR><TD className="text-center text-ink-500">미수금이 없습니다 👍</TD><TD></TD></TR>
              ) : topDebtors.map((d) => (
                <TR key={d.name}>
                  <TD>{d.name}</TD>
                  <TD className="text-right tabular-nums font-medium text-red-600">{formatWon(d.balance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        {/* 최근 수금 */}
        <div>
          <h2 className="text-sm font-semibold text-ink-700 mb-2">최근 수금 내역</h2>
          <Table>
            <THead>
              <TR><TH>입금일</TH><TH>거래처</TH><TH>방법</TH><TH className="text-right">수금액</TH></TR>
            </THead>
            <TBody>
              {recentPayments.length === 0 ? (
                <TR><TD>—</TD><TD></TD><TD></TD><TD></TD></TR>
              ) : recentPayments.map((p) => (
                <TR key={p.id}>
                  <TD className="tabular-nums">{p.date}</TD>
                  <TD>{p.clientName}</TD>
                  <TD className="text-ink-500">{p.method}</TD>
                  <TD className="text-right tabular-nums font-medium text-emerald-600">{formatWon(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
