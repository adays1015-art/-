import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import RemnantShape from "@/components/RemnantShape";
import StatusBadge, { sourceLabel } from "@/components/StatusBadge";
import { bbox } from "@/lib/geometry";
import { ageDays, getRemnant } from "@/lib/store";
import { fmtKstDateTime } from "@/lib/time";
import type { Remnant, ScrapReason } from "@/lib/types";

const SCRAP_REASON: Record<ScrapReason, string> = {
  unusable: "재사용 불가 형상",
  not_found: "위치 불명·누락",
  aged: "장기 방치",
};

const fmt = fmtKstDateTime;

export default function RemnantDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { registered?: string } }) {
  const data = getRemnant(params.id);
  if (!data) notFound();
  const { remnant: r, parent, children, inference } = data;
  const b = bbox(r.outline);

  const rows: [string, React.ReactNode][] = [
    ["상태", <StatusBadge key="s" status={r.status} />],
    ["재질 · 두께", `${r.material} · ${r.thicknessMm}mm`],
    ["외접 크기", `${b.width} × ${b.height} mm`],
    ["순면적", `${(r.areaMm2 / 1e6).toFixed(3)} ㎡`],
    ["중량", `${r.weightKg.toLocaleString()} kg`],
    ["홀", r.holes.length ? `${r.holes.length}개` : "없음"],
    ["적치 위치", r.rack],
    ["등록 방식", sourceLabel(r.source)],
    ["등록 시각", `${fmt(r.createdAt)} (${ageDays(r)}일 경과)`],
    ["처리 시각", fmt(r.closedAt)],
  ];
  if (r.scrapReason) rows.push(["폐기 사유", SCRAP_REASON[r.scrapReason]]);

  return (
    <div className="max-w-6xl">
      <Link href="/remnants" className="inline-flex items-center gap-1 text-sm text-ink-600 hover:text-brand-700 mb-3">
        <ArrowLeft size={14} /> 잔재 목록
      </Link>
      <PageHeader title={r.engravedId} description={`내부 ID ${r.id}`}
        actions={<Link href="/register" className="btn-primary">새 잔재 등록</Link>} />
      {searchParams.registered && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          등록되었습니다. 대시보드의 재고와 KPI에 바로 반영됩니다.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <div className="panel panel-pad flex items-center justify-center">
            <RemnantShape outline={r.outline} holes={r.holes} size={460} showDims />
          </div>
          {r.photo && (
            <div className="panel panel-pad">
              <div className="panel-title mb-3">등록 사진</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.photo} alt={`${r.engravedId} 등록 사진`} className="w-full rounded-lg border border-border" />
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="panel panel-pad">
            <div className="panel-title mb-3">잔재 정보</div>
            <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {inference && (
            <div className="panel panel-pad">
              <div className="panel-title mb-3">AI 인식 결과</div>
              <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm">
                <dt className="text-ink-500">모델</dt><dd className="font-mono text-xs">{inference.modelVersion}</dd>
                <dt className="text-ink-500">신뢰도</dt><dd className="tabular-nums">{(inference.confidence * 100).toFixed(1)}%</dd>
                <dt className="text-ink-500">추론 시간</dt><dd className="tabular-nums">{(inference.latencyMs / 1000).toFixed(2)}초</dd>
                <dt className="text-ink-500">작업자 수정</dt><dd>{inference.corrected ? "외곽선 수정함 (재학습 대상)" : "수정 없음"}</dd>
              </dl>
            </div>
          )}

          <div className="panel panel-pad">
            <div className="panel-title mb-3">잔재 계보</div>
            <Lineage label="상위 잔재" items={parent ? [parent] : []} empty="원판에서 발생" />
            <Lineage label="하위 잔재" items={children} empty="없음" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Lineage({ label, items, empty }: { label: string; items: Remnant[]; empty: string }) {
  return (
    <div className="text-sm mb-2 last:mb-0">
      <span className="text-ink-500 mr-2">{label}</span>
      {items.length ? items.map((x) => (
        <Link key={x.id} href={`/remnants/${x.id}`} className="font-mono text-xs text-brand-700 hover:underline mr-2">{x.engravedId}</Link>
      )) : <span className="text-ink-600">{empty}</span>}
    </div>
  );
}
