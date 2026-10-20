import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import KpiPanel from "@/components/KpiPanel";
import RemnantShape from "@/components/RemnantShape";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { KPI_DEFS, computeKpis, weeklySeries, isMet } from "@/lib/kpi";
import { ageDays, getDataset, inventory, longStored, now } from "@/lib/store";

// 실데이터 연결 시 매 요청마다 최신 KPI를 계산하도록 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 28;
const LONG_DAYS = 45;

const fmtDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};
const t1 = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const weight = (kg: number) => (kg >= 1000 ? `${t1(kg / 1000)}톤` : `${Math.round(kg).toLocaleString()}kg`);

export default function DashboardPage() {
  const ds = getDataset();
  const end = now();
  const from = end - WINDOW_DAYS * 86_400_000;
  const current = computeKpis(ds, from, end);
  const series = weeklySeries(ds, ds.baselineStart, new Date(end).toISOString());
  const pilotStart = Date.parse(ds.pilotStart);
  const metCount = KPI_DEFS.filter((d) => isMet(d, current[d.key])).length;

  const inv = inventory();
  const invTotal = inv.reduce((s, r) => ({ count: s.count + r.count, areaM2: s.areaM2 + r.areaM2, weightKg: s.weightKg + r.weightKg }), { count: 0, areaM2: 0, weightKg: 0 });
  const aged = longStored(LONG_DAYS);
  const weekAgo = end - 7 * 86_400_000;
  const registeredThisWeek = ds.remnants.filter((r) => Date.parse(r.createdAt) >= weekAgo).length;

  return (
    <div className="max-w-7xl">
      <PageHeader
        title="실증 대시보드"
        description={`최근 4주(${fmtDate(from)} ~ ${fmtDate(end)}) 기준 · 대림산업 부산 주력 사업장`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Summary label="KPI 목표 달성" value={`${metCount} / ${KPI_DEFS.length}`} hint="최근 4주 기준" />
        <Summary label="가용 잔재" value={`${invTotal.count}개`} hint={`${weight(invTotal.weightKg)} · ${t1(invTotal.areaM2)}㎡`} />
        <Summary label="최근 7일 등록" value={`${registeredThisWeek}개`} />
        <Summary label={`장기 보관 (${LONG_DAYS}일 이상)`} value={`${aged.length}개`} hint="우선 사용 대상" warn={aged.length > 0} />
      </div>

      <h2 className="text-sm font-semibold text-ink-900 mb-3">실증 KPI <span className="font-normal text-ink-500">— 기획서 2.2절</span></h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {KPI_DEFS.map((def) => (
          <KpiPanel key={def.key} def={def} current={current[def.key]} series={series} pilotStart={pilotStart} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold text-ink-900 mb-3">재질·두께별 가용 재고</h2>
          <Table>
            <THead>
              <tr><TH>재질</TH><TH className="text-right">두께</TH><TH className="text-right">수량</TH><TH className="text-right">면적</TH><TH className="text-right">중량</TH></tr>
            </THead>
            <TBody>
              {inv.map((r) => (
                <TR key={`${r.material}-${r.thicknessMm}`}>
                  <TD className="font-medium">{r.material}</TD>
                  <TD className="text-right tabular-nums">{r.thicknessMm}t</TD>
                  <TD className="text-right tabular-nums">
                    <Link className="text-brand-700 hover:underline" href={`/remnants?status=available&material=${r.material}&thickness=${r.thicknessMm}`}>{r.count}</Link>
                  </TD>
                  <TD className="text-right tabular-nums">{t1(r.areaM2)}㎡</TD>
                  <TD className="text-right tabular-nums">{weight(r.weightKg)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!inv.length && <Empty>가용 잔재가 없습니다.</Empty>}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink-900 mb-3">장기 보관 잔재 <span className="font-normal text-ink-500">— 오래된 순</span></h2>
          <Table>
            <THead>
              <tr><TH>형상</TH><TH>각인 ID</TH><TH>재질·두께</TH><TH className="text-right">중량</TH><TH>위치</TH><TH className="text-right">보관</TH></tr>
            </THead>
            <TBody>
              {aged.slice(0, 8).map((r) => (
                <TR key={r.id}>
                  <TD><RemnantShape outline={r.outline} holes={r.holes} size={36} /></TD>
                  <TD><Link className="font-mono text-xs text-brand-700 hover:underline" href={`/remnants/${r.id}`}>{r.engravedId}</Link></TD>
                  <TD>{r.material} · {r.thicknessMm}t</TD>
                  <TD className="text-right tabular-nums">{t1(r.weightKg)}kg</TD>
                  <TD>{r.rack}</TD>
                  <TD className="text-right tabular-nums text-amber-700 font-medium">{ageDays(r)}일</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {!aged.length && <Empty>장기 보관 잔재가 없습니다.</Empty>}
          {aged.length > 8 && (
            <div className="mt-2 text-right text-xs">
              <Link className="text-brand-700 hover:underline" href="/remnants?status=available&sort=oldest">전체 {aged.length}개 보기 →</Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Summary({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="panel panel-pad">
      <div className="text-xs font-medium text-ink-600">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${warn ? "text-amber-700" : "text-ink-900"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}
