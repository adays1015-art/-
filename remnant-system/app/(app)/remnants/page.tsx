import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import RemnantShape from "@/components/RemnantShape";
import StatusBadge, { STATUS_LABEL, sourceLabel } from "@/components/StatusBadge";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { bbox } from "@/lib/geometry";
import { ageDays, listRemnants, materials } from "@/lib/store";
import type { RemnantStatus } from "@/lib/types";

const PAGE_SIZE = 50;
const STATUSES: (RemnantStatus | "all")[] = ["all", "available", "reserved", "used", "scrapped"];

type SP = { status?: string; material?: string; thickness?: string; q?: string; sort?: string; page?: string };

export default function RemnantsPage({ searchParams }: { searchParams: SP }) {
  const status = (STATUSES as string[]).includes(searchParams.status ?? "") ? (searchParams.status as RemnantStatus | "all") : "available";
  const thickness = Number(searchParams.thickness) || undefined;
  const sort = searchParams.sort === "oldest" ? "oldest" : "newest";
  const rows = listRemnants({ status, material: searchParams.material || undefined, thickness, q: searchParams.q, sort });
  const page = Math.max(1, Number(searchParams.page) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const link = (p: number) => {
    const q = new URLSearchParams({ ...searchParams, status, page: String(p) } as Record<string, string>);
    return `/remnants?${q}`;
  };

  return (
    <div className="max-w-7xl">
      <PageHeader title="잔재 목록" description={`${rows.length.toLocaleString()}개`} />

      <form className="panel panel-pad mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end" action="/remnants">
        <div>
          <label className="label" htmlFor="status">상태</label>
          <select id="status" name="status" defaultValue={status} className="input">
            {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "전체" : STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="material">재질</label>
          <select id="material" name="material" defaultValue={searchParams.material ?? ""} className="input">
            <option value="">전체</option>
            {materials().map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="thickness">두께(mm)</label>
          <input id="thickness" name="thickness" type="number" min={1} defaultValue={searchParams.thickness ?? ""} className="input" placeholder="전체" />
        </div>
        <div>
          <label className="label" htmlFor="q">각인 ID · 위치</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ""} className="input" placeholder="예: DL2610, A-03" />
        </div>
        <div>
          <label className="label" htmlFor="sort">정렬</label>
          <select id="sort" name="sort" defaultValue={sort} className="input">
            <option value="newest">최근 등록순</option>
            <option value="oldest">오래된 순</option>
          </select>
        </div>
        <button className="btn-primary justify-center h-[38px] col-span-2 md:col-span-1" type="submit">조회</button>
      </form>

      <Table>
        <THead>
          <tr>
            <TH>형상</TH><TH>각인 ID</TH><TH>상태</TH><TH>재질·두께</TH><TH className="text-right">크기 (mm)</TH>
            <TH className="text-right">중량</TH><TH>위치</TH><TH>등록 방식</TH><TH className="text-right">경과</TH>
          </tr>
        </THead>
        <TBody>
          {shown.map((r) => {
            const b = bbox(r.outline);
            return (
              <TR key={r.id}>
                <TD><RemnantShape outline={r.outline} holes={r.holes} size={40} /></TD>
                <TD><Link className="font-mono text-xs text-brand-700 hover:underline" href={`/remnants/${r.id}`}>{r.engravedId}</Link></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.material} · {r.thicknessMm}t</TD>
                <TD className="text-right tabular-nums">{b.width} × {b.height}</TD>
                <TD className="text-right tabular-nums">{r.weightKg.toLocaleString()}kg</TD>
                <TD>{r.rack}</TD>
                <TD className="text-ink-600">{sourceLabel(r.source)}</TD>
                <TD className="text-right tabular-nums text-ink-600">{ageDays(r)}일</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {!rows.length && <Empty>조건에 맞는 잔재가 없습니다.</Empty>}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn-ghost" href={link(page - 1)}>이전</Link>}
          <span className="text-ink-600 tabular-nums">{page} / {pages}</span>
          {page < pages && <Link className="btn-ghost" href={link(page + 1)}>다음</Link>}
        </div>
      )}
    </div>
  );
}
