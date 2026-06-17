"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Trash2, Printer } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import LotLabelPreview from "@/components/LotLabelPreview";
import { printLotLabel, type LotLabel } from "@/lib/printLabel";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type {
  Fragrance, FragranceBomLine, FragranceLot, FragranceLotStatus,
  FragranceExecutionMaterial, Material,
} from "@/types";
import { FRAGRANCE_LOT_STATUSES } from "@/types";
import {
  formatCurrency, formatDateKst, formatNumber,
  generateFragranceLotCode, todayISO,
} from "@/lib/utils";
import { getFragranceWorkers } from "@/lib/workers";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
// 향생산 reuses the SAME permission logic as 품목생산 + 원료입출고 —
// anyone allowed to create production LOTs or move materials can save here.
import SaveErrorPanel, { type SaveErrorDetail } from "@/components/SaveErrorPanel";

interface AdjustmentRow {
  materialCode: string;
  materialName: string;
  category?: string;
  unit: string;
  bomQty: number;       // BOM.qty (per 1 base run)
  adjustmentQty: number;
  unitCost: number;
  currentStock: number;
}

interface InlineDraft {
  productionDate: string;
  fragranceCode: string;
  fragranceName: string;
  multiplier: number;
  actualProducedQty: number;
  worker: string;
  note: string;
  lotCode: string;
  registerToInventory: boolean;
  status: FragranceLotStatus;
  mixingDate: string;
  mixingWorker: string;
  mixingNote: string;
  scentTestDate: string;
  scentTestWorker: string;
  scentTestNote: string;
}

function emptyDraft(): InlineDraft {
  // First fragrance worker (이정혜) auto-default per spec #10 equivalent.
  const fw = getFragranceWorkers();
  const first = fw[0] ?? "";
  return {
    productionDate: todayISO(),
    fragranceCode: "",
    fragranceName: "",
    multiplier: 1,
    actualProducedQty: 0,
    worker: first,
    note: "",
    lotCode: "",
    registerToInventory: true,
    status: "완료",
    mixingDate: "", mixingWorker: first, mixingNote: "",
    scentTestDate: "", scentTestWorker: first, scentTestNote: "",
  };
}

export default function FragranceProductionClient({
  initialLots, initialExec, fragrances, bom, materials: initialMaterials,
}: {
  initialLots: FragranceLot[];
  initialExec: FragranceExecutionMaterial[];
  fragrances: Fragrance[];
  bom: FragranceBomLine[];
  materials: Material[];
}) {
  const router = useRouter();
  const [lots, setLots] = useState<FragranceLot[]>(initialLots);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const [exec, setExec] = useState<FragranceExecutionMaterial[]>(initialExec);
  const [materials, setMaterials] = useState<Material[]>(initialMaterials);
  const [draft, setDraft] = useState<InlineDraft>(emptyDraft());
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveErrorDetail | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  // 라벨 인쇄 모달
  const [printingLot, setPrintingLot] = useState<FragranceLot | null>(null);
  function buildLabel(lot: FragranceLot): LotLabel {
    return {
      name: lot.fragranceName || lot.fragranceCode || "(향)",
      code: lot.lotNo,
      sub: `${formatDateKst(lot.productionDate)} · ${formatNumber(lot.actualProducedQty)}ml`,
    };
  }
  // 폐기 처리 모달
  type FragranceDisposal = {
    lot: FragranceLot;
    disposalDate: string;
    disposalQty: number;
    disposalReason: string;
    disposalWorker: string;
  };
  const [disposing, setDisposing] = useState<FragranceDisposal | null>(null);
  const [disposeBusy, setDisposeBusy] = useState(false);
  const [disposeError, setDisposeError] = useState<string | null>(null);

  function openDispose(l: FragranceLot) {
    const fw = getFragranceWorkers();
    const preWorker = (l.worker && fw.includes(l.worker)) ? l.worker : (fw[0] ?? "");
    setDisposing({
      lot: l,
      disposalDate: todayISO(),
      disposalQty: l.actualProducedQty ?? 0,
      disposalReason: "",
      disposalWorker: preWorker,
    });
    setDisposeError(null);
  }

  async function submitDispose() {
    if (!disposing) return;
    if (!disposing.disposalReason.trim()) {
      setDisposeError("폐기 사유를 입력하세요.");
      return;
    }
    if (!disposing.disposalWorker.trim()) {
      setDisposeError("폐기 담당자를 선택하세요.");
      return;
    }
    setDisposeBusy(true);
    setDisposeError(null);
    try {
      const res = await fetch("/api/fragrance-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dispose",
          id: disposing.lot.id,
          disposalDate: disposing.disposalDate,
          disposalQty: disposing.disposalQty,
          disposalReason: disposing.disposalReason,
          disposalWorker: disposing.disposalWorker,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setDisposeError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const updated = json.data as FragranceLot | undefined;
      if (updated && updated.id) {
        setLots((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      }
      await refetchAll();
      router.refresh();
      setDisposing(null);
    } catch (err) {
      setDisposeError((err as Error).message);
    } finally {
      setDisposeBusy(false);
    }
  }
  // Union of the production-area permissions: 품목생산 (item-production) OR
  // 원료입출고 (materials). Granting either is sufficient.
  const canEditProduction = useCanEdit("item-production");
  const canEditMaterials = useCanEdit("materials");
  const canEdit = canEditProduction || canEditMaterials;

  async function onRegister(lotId: string) {
    if (!confirm("이 LOT을 원료재고에 등록하시겠습니까? 중복 등록은 자동으로 방지됩니다.")) return;
    setRegisteringId(lotId);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/fragrance-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", id: lotId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError({ message: json.error ?? `HTTP ${res.status}`, sheetName: json.sheetName, appsScript: json.appsScript });
        return;
      }
      if (json.warning) setWarning(json.warning);
      // Optimistic — replace the LOT row in place with the updated record so
      // the chip flips 대기 → 사용가능 immediately.
      if (json.data && (json.data as FragranceLot).id) {
        const updated = json.data as FragranceLot;
        setLots((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      }
      refetchAll();
      router.refresh();
    } catch (err) {
      setError({ message: (err as Error).message });
    } finally {
      setRegisteringId(null);
    }
  }

  // ─── derived ─────────────────────────────────────────────
  const baseRows: AdjustmentRow[] = useMemo(() => {
    if (!draft.fragranceCode) return [];
    const lines = bom.filter((b) => b.fragranceCode === draft.fragranceCode);
    return lines.map((l) => {
      const m = materials.find(
        (x) => x.id === l.materialCode || x.materialCode === l.materialCode,
      );
      return {
        materialCode: l.materialCode,
        materialName: l.materialName || m?.materialName || m?.name || "",
        category: l.category,
        unit: l.unit || m?.unit || "",
        bomQty: l.qty,
        adjustmentQty: 0,
        unitCost: m?.unitCost ?? m?.unitPrice ?? 0,
        currentStock: m?.stock ?? 0,
      };
    });
  }, [draft.fragranceCode, bom, materials]);

  const summary = useMemo(() => {
    const rows = baseRows.map((r) => {
      const adj = adjustments[r.materialCode] ?? 0;
      const baseTotalQty = r.bomQty * draft.multiplier;
      const actualQty = baseTotalQty + adj;
      const materialCost = actualQty * r.unitCost;
      const stockAfter = r.currentStock - actualQty;
      return { ...r, adjustmentQty: adj, baseTotalQty, actualQty, materialCost, stockAfter };
    });
    const totalCost = rows.reduce((s, r) => s + r.materialCost, 0);
    const unitCost = draft.actualProducedQty > 0 ? totalCost / draft.actualProducedQty : 0;
    return { rows, totalCost, unitCost, insufficient: rows.filter((r) => r.stockAfter < 0) };
  }, [baseRows, adjustments, draft.multiplier, draft.actualProducedQty]);

  const lotPreview = useMemo(
    () => generateFragranceLotCode(
      draft.productionDate,
      lots.map((l) => l.lotNo),
    ),
    [draft.productionDate, lots],
  );

  // selectedFragrance: match by canonical key (fragranceCode || id). This
  // tolerates rows that have an id but no fragranceCode column populated.
  const selectedFragrance = fragrances.find(
    (f) => (f.fragranceCode || f.id) === draft.fragranceCode,
  );

  // ─── Save validation ──────────────────────────────────────
  // Only the three required fields gate save. Optional fields
  // (registerToInventory, inventoryStatus, BOM presence, multiplier, lot
  // code, worker, note) MUST NOT block save.
  const v = {
    fragranceCodeValid: !!draft.fragranceCode,
    productionDateValid: !!draft.productionDate,
    actualProducedQtyValid: draft.actualProducedQty > 0,
    bomExists: baseRows.length > 0,
  };
  const formValid = v.fragranceCodeValid && v.productionDateValid && v.actualProducedQtyValid;

  async function refetchAll() {
    try {
      const [prodRes, matsRes] = await Promise.all([
        fetch("/api/fragrance-production", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/materials", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (prodRes.data?.lots) setLots(prodRes.data.lots);
      if (prodRes.data?.exec) setExec(prodRes.data.exec);
      if (Array.isArray(matsRes.data)) setMaterials(matsRes.data);
    } catch { /* keep stale */ }
  }

  async function onSave() {
    if (!draft.fragranceCode) {
      setWarning("향을 먼저 선택하세요.");
      return;
    }
    if (draft.actualProducedQty <= 0) {
      setWarning("실제 생산수량(ml)을 1 이상 입력하세요.");
      return;
    }
    setSaving(true);
    setWarning(null);
    setError(null);
    const resolvedLotCode = (draft.lotCode || "").trim() || lotPreview;
    const payload = {
      productionDate: draft.productionDate,
      fragranceCode: draft.fragranceCode,
      multiplier: draft.multiplier,
      actualProducedQty: draft.actualProducedQty,
      worker: draft.worker,
      note: draft.note,
      lotNo: resolvedLotCode,
      // Safe default — never block save if this is somehow undefined.
      // 테스트 status forces registerToInventory=false on the server side.
      registerToInventory: draft.status === "테스트" ? false : (draft.registerToInventory ?? false),
      status: draft.status,
      mixingDate: draft.mixingDate, mixingWorker: draft.mixingWorker, mixingNote: draft.mixingNote,
      scentTestDate: draft.scentTestDate, scentTestWorker: draft.scentTestWorker, scentTestNote: draft.scentTestNote,
      actualMaterials: summary.rows.map((r) => ({
        materialCode: r.materialCode,
        materialName: r.materialName,
        baseQty: r.bomQty,
        adjustmentQty: r.adjustmentQty,
        actualQty: r.actualQty,
        unit: r.unit,
        unitCost: r.unitCost,
        materialCost: r.materialCost,
      })),
    };
    try {
      const res = await fetch("/api/fragrance-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError({
          message: json.error ?? `HTTP ${res.status}`,
          sheetName: json.sheetName,
          appsScript: json.appsScript,
        });
        return;
      }
      if (json.warning) setWarning(json.warning);
      // ─── Optimistic local update ─────────────────────────
      // Apply the server's authoritative new lot to local state immediately
      // so the LOT list reflects the new row without waiting on the refetch.
      if (json.data && (json.data as FragranceLot).id) {
        setLots((prev) => [json.data as FragranceLot, ...prev]);
      }
      // Clear form immediately so the user can start the next entry.
      setDraft(emptyDraft());
      setAdjustments({});
      // Background refetch — refreshes the exec rows + materials master.
      refetchAll();
      router.refresh();
    } catch (err) {
      setError({ message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const sortedFragrances = useMemo(
    () => fragrances.slice().sort((a, b) => a.fragranceCode.localeCompare(b.fragranceCode)),
    [fragrances],
  );

  return (
    <div>
      <PageHeader
        title="향 생산"
        description="향(fragrance) 생산. 저장 시 원료재고 차감 + 생산된 향은 원료재고에 향료로 입고됩니다. 품목BOM에서 일반 원료처럼 참조 가능."
      />

      <div className="panel mb-6 relative z-0">
        <div className="px-4 py-3 border-b border-border bg-bg-subtle/50 flex items-center gap-2 text-sm font-semibold">
          <FlaskConical size={14} className="text-ink-500" /> 새 향 LOT 등록
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            actualQty = baseQty × multiplier + adjustmentQty · 1ml 원가 = 총 자재비 ÷ actualProducedQty
          </span>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="label">향 선택</label>
              <select className="input" value={draft.fragranceCode}
                onChange={(e) => {
                  const key = e.target.value;
                  // Find the selected fragrance using the SAME canonical key
                  // we render as the option value (fragranceCode || id).
                  const picked = sortedFragrances.find(
                    (f) => (f.fragranceCode || f.id) === key,
                  );
                  setDraft({
                    ...draft,
                    fragranceCode: key,
                    fragranceName: picked?.fragranceName ?? "",
                  });
                }}>
                <option value="">— 향을 선택하세요 —</option>
                {sortedFragrances.map((f) => {
                  // Fallback to id when fragranceCode column is empty so the
                  // option value is never "" (which would collide with the
                  // placeholder and silently fail to update the dropdown).
                  const key = f.fragranceCode || f.id;
                  return (
                    <option key={f.id || f.fragranceCode} value={key}>
                      {key} · {f.fragranceName} ({f.productType} · {f.fragranceType})
                      {!f.fragranceCode && " [코드 미지정]"}
                    </option>
                  );
                })}
              </select>
              {draft.fragranceCode && (
                <div className="mt-1 text-[11px] text-ink-600">
                  선택됨: <b className="text-ink-900">{draft.fragranceName || selectedFragrance?.fragranceName || "—"}</b>
                  <span className="ml-1 font-mono text-ink-500">({draft.fragranceCode})</span>
                </div>
              )}
            </div>
            <div>
              <label className="label">생산일</label>
              <input className="input" type="date" value={draft.productionDate}
                onChange={(e) => setDraft({ ...draft, productionDate: e.target.value })} />
            </div>
            <div>
              <label className="label">담당자</label>
              {(() => {
                const fw = getFragranceWorkers();
                const cur = (draft.worker ?? "").trim();
                const known = cur && fw.includes(cur);
                return (
                  <select className="input" value={cur}
                    onChange={(e) => setDraft({ ...draft, worker: e.target.value })}>
                    <option value="">— 담당자 선택 —</option>
                    {fw.map((w) => <option key={w} value={w}>{w}</option>)}
                    {cur && !known && <option value={cur}>{cur} (기존)</option>}
                  </select>
                );
              })()}
            </div>
            <div>
              <label className="label">상태</label>
              <select className="input" value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as FragranceLotStatus })}>
                {FRAGRANCE_LOT_STATUSES.filter((s) => s !== "폐기").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">작업배수 (multiplier)</label>
              <div className="flex items-stretch gap-1">
                <button type="button" className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-sm font-semibold"
                  disabled={draft.multiplier <= 0.5}
                  onClick={() => setDraft({ ...draft, multiplier: Math.max(0.5, Number((draft.multiplier - 0.5).toFixed(2))) })}>−</button>
                <input className="input text-right tabular-nums flex-1" type="number" min={0.5} step={0.5}
                  value={draft.multiplier}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setDraft({ ...draft, multiplier: Number.isFinite(n) && n >= 0.5 ? n : 0.5 });
                  }} />
                <button type="button" className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel text-sm font-semibold"
                  onClick={() => setDraft({ ...draft, multiplier: Number((draft.multiplier + 0.5).toFixed(2)) })}>+</button>
              </div>
            </div>
            <div>
              <label className="label">실제 생산수량 (ml)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={draft.actualProducedQty || ""}
                onChange={(e) => setDraft({ ...draft, actualProducedQty: Number(e.target.value) || 0 })} />
            </div>
            <div className="lg:col-span-2">
              <label className="label">메모</label>
              <input className="input" value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </div>
            <div className="lg:col-span-4">
              <label className="label flex items-center gap-2 flex-wrap">
                <span>LOT 번호 <span className="text-[10px] text-ink-500 font-normal">— F-YYYYMMDD-순번</span></span>
                <span className="text-[11px] sm:text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                  ⚠ 자동 생성되니 손대지 말 것
                </span>
              </label>
              <div className="flex items-stretch gap-1">
                <input className="input flex-1 font-mono"
                  value={draft.lotCode}
                  placeholder={lotPreview || "향과 생산일을 먼저 입력하세요"}
                  onChange={(e) => setDraft({ ...draft, lotCode: e.target.value })} />
                <button type="button" disabled={!lotPreview}
                  className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-xs font-medium whitespace-nowrap"
                  onClick={() => setDraft({ ...draft, lotCode: lotPreview })}>
                  LOT 번호 다시 생성
                </button>
              </div>
            </div>
            {/* ─── 배합 / 시향 공정 ─────────────────────────── */}
            <div className="lg:col-span-4 rounded-md border border-border bg-bg-subtle/40 p-3">
              <div className="text-xs font-semibold text-ink-800 mb-2">
                공정 추적 <span className="text-[10px] text-ink-500 font-normal">— 배합 · 시향 (선택 입력 · 재고/원가에는 영향 없음)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: "배합", dateK: "mixingDate" as const, workerK: "mixingWorker" as const, noteK: "mixingNote" as const, tone: "bg-violet-50 text-violet-800 border-violet-200" },
                  { key: "시향", dateK: "scentTestDate" as const, workerK: "scentTestWorker" as const, noteK: "scentTestNote" as const, tone: "bg-sky-50 text-sky-800 border-sky-200" },
                ].map((s) => {
                  const fw = getFragranceWorkers();
                  const cur = draft[s.workerK] ?? "";
                  const known = cur && fw.includes(cur);
                  return (
                    <div key={s.key} className="rounded border border-border bg-bg-panel p-2 space-y-1">
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${s.tone}`}>{s.key}</span>
                      </div>
                      <input className="input" type="date"
                        value={draft[s.dateK]}
                        onChange={(e) => setDraft({ ...draft, [s.dateK]: e.target.value } as InlineDraft)} />
                      <select className="input"
                        value={cur}
                        onChange={(e) => setDraft({ ...draft, [s.workerK]: e.target.value } as InlineDraft)}>
                        <option value="">— {s.key} 담당자 —</option>
                        {fw.map((w) => <option key={w} value={w}>{w}</option>)}
                        {cur && !known && <option value={cur}>{cur} (기존)</option>}
                      </select>
                      <input className="input" placeholder={`${s.key} 메모`}
                        value={draft[s.noteK]}
                        onChange={(e) => setDraft({ ...draft, [s.noteK]: e.target.value } as InlineDraft)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {draft.fragranceCode && (
            summary.rows.length > 0 ? (
              <div className="rounded-md border border-border overflow-x-auto">
                <div className="px-3 py-2 text-xs font-semibold bg-bg-subtle/60 border-b border-border">
                  원료재고 차감 미리보기 · 향 ({draft.fragranceCode}) BOM {summary.rows.length}종
                </div>
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-th">materialCode</th>
                    <th className="table-th">materialName</th>
                    <th className="table-th text-right">기준 BOM</th>
                    <th className="table-th text-right">× 배수 = 기준량</th>
                    <th className="table-th text-right">추가/감소</th>
                    <th className="table-th text-right">실 투입량</th>
                    <th className="table-th text-right">stock before</th>
                    <th className="table-th text-right">stock after</th>
                    <th className="table-th text-right">단가</th>
                    <th className="table-th text-right">원료비</th>
                  </tr></thead>
                  <tbody>
                    {summary.rows.map((r) => (
                      <tr key={r.materialCode}>
                        <td className="table-td font-mono text-xs">{r.materialCode || <span className="text-red-700">(없음)</span>}</td>
                        <td className="table-td">
                          <div className="font-medium text-ink-900">{r.materialName}</div>
                          {r.category && <div className="text-[10px] text-ink-500">{r.category}</div>}
                        </td>
                        <td className="table-td text-right tabular-nums">{formatNumber(r.bomQty)} {r.unit}</td>
                        <td className="table-td text-right tabular-nums">{formatNumber(r.baseTotalQty)} {r.unit}</td>
                        <td className="table-td text-right">
                          <input className="input text-right tabular-nums w-20" type="number" step="0.01"
                            value={adjustments[r.materialCode] ?? 0}
                            onChange={(e) => setAdjustments((p) => ({ ...p, [r.materialCode]: Number(e.target.value) }))} />
                        </td>
                        <td className="table-td text-right tabular-nums font-medium">
                          −{formatNumber(r.actualQty)} {r.unit}
                        </td>
                        <td className="table-td text-right tabular-nums text-ink-700">{formatNumber(r.currentStock)} {r.unit}</td>
                        <td className={`table-td text-right tabular-nums ${r.stockAfter < 0 ? "text-red-700 font-medium" : ""}`}>
                          {formatNumber(r.stockAfter)} {r.unit}
                        </td>
                        <td className="table-td text-right tabular-nums">{formatCurrency(r.unitCost)}</td>
                        <td className="table-td text-right tabular-nums">{formatCurrency(r.materialCost)}</td>
                      </tr>
                    ))}
                    <tr className="bg-bg-subtle">
                      <td className="table-td font-semibold" colSpan={9}>실제 총 투입 원료비</td>
                      <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(summary.totalCost)}</td>
                    </tr>
                  </tbody>
                </table>
                {summary.insufficient.length > 0 && (
                  <div className="px-3 py-2 text-[11px] text-red-800 bg-red-50 border-t border-red-200">
                    ⚠ {summary.insufficient.length}종 원료의 차감 후 재고가 음수입니다.
                  </div>
                )}
              </div>
            ) : null /* missing-BOM warning is rendered below as a save-bar amber notice */
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-bg-subtle p-3">
              <div className="text-[11px] uppercase tracking-wider text-ink-500">원료재고 입고 (미리보기)</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {draft.actualProducedQty > 0
                  ? <>+{formatNumber(draft.actualProducedQty)} ml — {selectedFragrance?.fragranceName ?? "—"}</>
                  : <span className="text-ink-400 text-base">실제 생산수량 미입력</span>}
              </div>
              <div className="text-[11px] text-ink-500 mt-0.5">
                생산된 향은 원료재고에 <b>향료</b>로 자동 등록되어 품목BOM에서 사용 가능합니다.
              </div>
            </div>
            <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3">
              <div className="text-[11px] uppercase tracking-wider opacity-80">1ml 원가</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {draft.actualProducedQty > 0 ? formatCurrency(summary.unitCost) : "—"}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">총 자재비 ÷ 실제 생산수량 (ml)</div>
            </div>
          </div>

          <SaveErrorPanel error={error} onClose={() => setError(null)} />
          {warning && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{warning}</div>
          )}
          {/* Missing BOM is a warning — never blocks save. */}
          {draft.fragranceCode && !v.bomExists && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              <b>향 BOM이 없습니다</b> — 선택한 향 ({draft.fragranceCode})의 향BOM이 비어 있습니다.
              저장은 가능하지만 원료 차감은 일어나지 않습니다. 정확한 원가/재고 추적을 위해 먼저
              <b> 향 BOM</b> 페이지에서 배합비를 등록하세요.
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-start gap-2 text-sm text-ink-800 cursor-pointer select-none">
              <input type="checkbox" className="mt-0.5"
                checked={draft.registerToInventory}
                onChange={(e) => setDraft({ ...draft, registerToInventory: e.target.checked })} />
              <span>
                <b>원료재고로 등록</b>
                <div className="text-[10px] text-ink-500">
                  체크 시 생산된 향이 원료재고에 향료 카테고리로 자동 입고됩니다.
                  미체크 시 LOT만 기록되고 <b>inventoryStatus=대기</b> 상태로 보관 — 나중에 LOT 목록의 [재고 등록] 버튼으로 등록할 수 있습니다.
                </div>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-ghost"
                onClick={() => { setDraft(emptyDraft()); setAdjustments({}); }}>초기화</button>
              <button type="button" className="btn-primary" onClick={onSave}
                disabled={saving || !canEdit || !formValid}
                title={!canEdit ? PERMISSION_TIP : undefined}>
                {saving ? "저장 중..." : "향 LOT 저장"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Save validation debug (sibling of form — never overlays controls) ─── */}
      <div className="mb-6 rounded-md border border-dashed border-ink-300 bg-bg-subtle/40 px-3 py-2 text-[11px] text-ink-700 font-mono leading-relaxed">
        <div className="font-semibold text-ink-900 mb-1">[debug] 저장 검증 상태</div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span>fragranceCode: <b className={v.fragranceCodeValid ? "text-emerald-700" : "text-red-700"}>{v.fragranceCodeValid ? "OK" : "필수"} ({draft.fragranceCode || "—"})</b></span>
          <span>productionDate: <b className={v.productionDateValid ? "text-emerald-700" : "text-red-700"}>{v.productionDateValid ? "OK" : "필수"} ({draft.productionDate || "—"})</b></span>
          <span>actualProducedQty &gt; 0: <b className={v.actualProducedQtyValid ? "text-emerald-700" : "text-red-700"}>{v.actualProducedQtyValid ? "OK" : "필수"} ({draft.actualProducedQty})</b></span>
          <span>BOM exists: <b className={v.bomExists ? "text-emerald-700" : "text-amber-700"}>{v.bomExists ? `OK (${baseRows.length}종)` : "없음 (선택사항)"}</b></span>
          <span>formValid: <b className={formValid ? "text-emerald-700" : "text-red-700"}>{String(formValid)}</b></span>
          <span>canEdit: <b className={canEdit ? "text-emerald-700" : "text-red-700"}>{String(canEdit)}</b> (production={String(canEditProduction)} · materials={String(canEditMaterials)})</span>
          <span>saving: <b>{String(saving)}</b></span>
          <span>registerToInventory: <b>{String(draft.registerToInventory ?? false)}</b></span>
        </div>
        <div className="mt-1 text-[10px] text-ink-500 font-sans">필수 필드 3개(fragranceCode · productionDate · actualProducedQty&gt;0) + canEdit 만 저장을 막습니다. 향BOM/multiplier/lot/등록여부는 선택사항입니다.</div>
      </div>

      <div className="text-xs text-ink-500 mb-2">등록된 향 LOT 목록</div>
      <Table>
        <THead>
          <TR>
            <TH>생산일</TH><TH>향 코드</TH><TH>향 이름</TH>
            <TH>LOT</TH>
            <TH className="text-right">생산량 (ml)</TH>
            <TH className="text-right">1ml 원가</TH>
            <TH>담당자</TH>
            <TH>상태</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {lots.length === 0 ? <Empty>등록된 향 LOT이 없습니다.</Empty> :
            lots.slice().sort((a, b) => (b.productionDate || "").localeCompare(a.productionDate || ""))
              .slice(0, visibleCount)
              .map((l) => {
                const usedRows = exec.filter((e) => e.lotNo === l.lotNo);
                // Display status: prefer new `status` field; fall back to legacy inventoryStatus mapping.
                const displayStatus: string =
                  l.status ??
                  (l.inventoryStatus === "사용가능" ? "완료"
                    : l.inventoryStatus === "폐기" ? "폐기"
                    : l.inventoryStatus === "테스트" ? "테스트"
                    : "(미지정)");
                const statusChip =
                  displayStatus === "완료"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : displayStatus === "테스트"
                      ? "bg-purple-50 text-purple-800 border-purple-200"
                      : displayStatus === "폐기"
                        ? "bg-red-50 text-red-800 border-red-300 font-semibold"
                        : "bg-bg-subtle text-ink-700 border-border";
                const canRegister = !l.registerToInventory && l.inventoryStatus === "대기" && displayStatus !== "폐기";
                const canDispose = displayStatus !== "폐기" && !!l.registerToInventory;
                return (
                  <TR key={l.id}>
                    <TD>{formatDateKst(l.productionDate)}</TD>
                    <TD className="font-mono text-xs">{l.fragranceCode}</TD>
                    <TD className="font-medium">{l.fragranceName}</TD>
                    <TD className="font-mono text-xs text-ink-700">
                      {l.lotNo}
                      {usedRows.length > 0 && <div className="text-[10px] text-ink-500">{usedRows.length}종 자재 기록</div>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(l.actualProducedQty)}</TD>
                    <TD className="text-right tabular-nums font-semibold">{formatCurrency(l.actualUnitCost)}</TD>
                    <TD>{l.worker}</TD>
                    <TD>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusChip}`}
                        title={displayStatus === "폐기"
                          ? `폐기일 ${formatDateKst(l.disposalDate ?? "")} · 사유 ${l.disposalReason ?? ""} · 담당자 ${l.disposalWorker ?? "(미지정)"}`
                          : undefined}>
                        {displayStatus}
                        {displayStatus === "폐기" && l.disposalQty != null && l.disposalQty > 0 && (
                          <span className="font-normal text-red-700 ml-0.5">· {formatNumber(l.disposalQty)}ml</span>
                        )}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="text-ink-500 hover:text-ink-900"
                          onClick={() => setPrintingLot(l)}
                          title="LOT 라벨 인쇄"
                        ><Printer size={14} /></button>
                        {canDispose && (
                          <button
                            className="text-ink-500 hover:text-red-600"
                            onClick={() => openDispose(l)}
                            disabled={!canEdit}
                            title={canEdit ? "폐기 처리" : PERMISSION_TIP}
                          ><Trash2 size={14} /></button>
                        )}
                        {canRegister && (
                          <button
                            className="btn-ghost text-xs"
                            disabled={registeringId === l.id || !canEdit}
                            onClick={() => onRegister(l.id)}
                            title={!canEdit ? PERMISSION_TIP : "이 LOT을 원료재고에 등록"}
                          >{registeringId === l.id ? "등록 중..." : "재고 등록"}</button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })
          }
        </TBody>
      </Table>

      {lots.length > visibleCount && (
        <div className="mt-3 text-center">
          <button className="btn-ghost text-xs"
            onClick={() => setVisibleCount((n) => n + 50)}>
            더 보기 ({visibleCount} / {lots.length})
          </button>
        </div>
      )}
      {lots.length > 50 && lots.length <= visibleCount && (
        <div className="mt-3 text-center text-[11px] text-ink-500">
          전체 {lots.length}건 표시 중
        </div>
      )}

      {/* ─── 폐기 처리 모달 ────────────────────────────── */}
      <Modal open={!!disposing} onClose={() => { if (!disposeBusy) { setDisposing(null); setDisposeError(null); } }}
        title={disposing ? `폐기 처리 — ${disposing.lot.lotNo}` : ""} width="max-w-lg"
        footer={<>
          <button className="btn-ghost" disabled={disposeBusy}
            onClick={() => { setDisposing(null); setDisposeError(null); }}>취소</button>
          <button className="btn-primary"
            disabled={disposeBusy || !disposing?.disposalReason.trim() || !disposing?.disposalWorker.trim()}
            onClick={submitDispose}>
            {disposeBusy ? "처리 중..." : "폐기 확정"}
          </button>
        </>}>
        {disposing && (
          <div className="space-y-3">
            <div className="text-[12px] text-red-900 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <div className="font-semibold mb-0.5">⚠ 이 향 LOT을 폐기 처리합니다.</div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5">
                <li>향마스터 / 원료재고(향료) stock이 폐기 수량만큼 차감됩니다 (한 번만, 중복 폐기 자동 방지).</li>
                <li>원료재고(이미 사용된 원료)는 복구되지 않습니다.</li>
                <li>향생산투입원료 기록은 그대로 유지됩니다.</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">폐기일</label>
                <input className="input" type="date" value={disposing.disposalDate}
                  onChange={(e) => setDisposing({ ...disposing, disposalDate: e.target.value })} />
              </div>
              <div>
                <label className="label">폐기 수량 (ml) <span className="text-[10px] text-ink-500">기본: actualProducedQty</span></label>
                <input className="input text-right tabular-nums" type="number" min={0}
                  value={disposing.disposalQty}
                  onChange={(e) => setDisposing({ ...disposing, disposalQty: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2">
                <label className="label">폐기 사유 <span className="text-red-700">*</span></label>
                <textarea className="input min-h-[60px]" value={disposing.disposalReason}
                  onChange={(e) => setDisposing({ ...disposing, disposalReason: e.target.value })}
                  placeholder="예: 향 휘발, 변질, 시향 불량, …" />
              </div>
              <div className="col-span-2">
                <label className="label">폐기 담당자 <span className="text-red-700">*</span></label>
                {(() => {
                  const fw = getFragranceWorkers();
                  const cur = disposing.disposalWorker.trim();
                  const known = cur && fw.includes(cur);
                  return (
                    <select className="input" value={cur}
                      onChange={(e) => setDisposing({ ...disposing, disposalWorker: e.target.value })}>
                      <option value="">— 담당자 선택 —</option>
                      {fw.map((w) => <option key={w} value={w}>{w}</option>)}
                      {cur && !known && <option value={cur}>{cur} (기존)</option>}
                    </select>
                  );
                })()}
              </div>
            </div>
            {disposeError && (
              <div className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                {disposeError}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ─── 라벨 미리보기/인쇄 모달 (50 × 20 mm) ────────────── */}
      <Modal open={!!printingLot} onClose={() => setPrintingLot(null)}
        title={printingLot ? `LOT 라벨 미리보기 — ${printingLot.lotNo}` : ""} width="max-w-md"
        footer={<>
          <button className="btn-ghost" onClick={() => setPrintingLot(null)}>닫기</button>
          <button className="btn-primary" onClick={() => printingLot && printLotLabel(buildLabel(printingLot))}>인쇄</button>
        </>}>
        {printingLot && <LotLabelPreview {...buildLabel(printingLot)} />}
      </Modal>

      <div className="mt-4 text-[11px] text-ink-500 flex items-start gap-1">
        <Plus size={12} className="mt-0.5" />
        <div>
          저장 시 항상: (1) 원료재고에서 실 투입량 자동 차감 + (2) 원료입출고 생산사용 기록.<br />
          <b>원료재고로 등록</b> 체크 시 추가로: (3) 향마스터 stock 증가, (4) 원료재고에 향료 카테고리로 등록/누적, (5) 원료입출고 입고 기록. inventoryStatus = <b>사용가능</b>.<br />
          미체크 시: 위 (3)~(5) 생략, inventoryStatus = <b>대기</b>. 나중에 위 표의 [재고 등록] 버튼으로 등록 가능 (중복 등록은 자동 방지).
        </div>
      </div>
    </div>
  );
}
