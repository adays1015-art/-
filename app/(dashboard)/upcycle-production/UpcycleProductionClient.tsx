"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, History as HistoryIcon, Trash2, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type {
  Item, ItemBomLine, ItemLot, LotStatus, Material,
  ProductionExecutionMaterial, Equipment,
} from "@/types";
import { LOT_STATUSES } from "@/types";
import { formatCurrency, formatDate, formatDateKst, formatNumber, generateLotCode, todayISO } from "@/lib/utils";
import { defaultWorker, getProductionWorkers, getQcWorkers } from "@/lib/workers";
import { convertQty, normalizeUnit } from "@/lib/units";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel, { type SaveErrorDetail } from "@/components/SaveErrorPanel";
import { useRouter } from "next/navigation";

function mapStatus(s: LotStatus): "예정" | "진행 중" | "완료" | "보류" | "테스트" {
  if (s === "진행중") return "진행 중";
  if (s === "완료") return "완료";
  if (s === "보류") return "보류";
  if (s === "테스트") return "테스트";
  return "예정";
}

type EditableLot = Omit<ItemLot, "id" | "productType" | "lotCode"> & { id?: string; productType?: ItemLot["productType"]; lotCode?: string };

function emptyLot(): EditableLot {
  // First production worker (정선희) as the auto-default for each process
  // step. The chip-render filter (ProcessBadges.hasStepData) ignores a
  // worker-only fill so a default worker alone won't make a chip appear —
  // the user still needs to set a date or pick equipment for the chip to
  // surface on the LOT list.
  const defaultProd = defaultWorker("production");
  const defaultQc   = defaultWorker("qc");
  return {
    date: todayISO(), itemNo: "",
    // Legacy fields kept at 0 — they're not part of the new flow but the
    // sheet still has columns for them. UI exposes actualProducedQty instead.
    targetQty: 0, completedQty: 0, defectQty: 0,
    // Default LOT-level 담당자 to "제조팀"; never overwritten when loading
    // an existing LOT.
    assignee: "제조팀", status: "예정", note: "",
    actualProducedQty: undefined,
    multiplier: 1,
    mixingDate: "",     mixingWorker:     defaultProd,
    dispersionDate: "", dispersionWorker: defaultProd,
    injectionDate: "",  injectionWorker:  defaultProd,
    qcDate: "",         qcWorker:         defaultQc,
    mixingMachine: "", dispersionMachine: "", injectionMachine: "", qcEquipment: "",
  };
}

interface AdjustmentRow {
  rowKey: string;         // unique per BOM line (l.id) — NOT materialCode, so
                          // the same material used in 배합 & 사출 stays separate
  materialId: string;     // resolved internal id for deduction
  materialCode: string;
  materialName: string;
  category?: string;
  unit: string;           // usage unit (BOM-side, e.g. "g")
  stockUnit: string;      // material storage unit (e.g. "kg")
  bomPerUnit: number;     // BOM.qty (base qty in usage unit)
  adjustmentQty: number;  // user input (+/-, total for the batch in usage unit)
  unitCost: number;
  currentStock: number;   // in stockUnit — the raw material.stock
}

export default function UpcycleProductionClient({
  initial, items: initialItems, bom, materials: initialMaterials, executions,
  equipment = [],
}: {
  initial: ItemLot[];
  items: Item[];
  bom: ItemBomLine[];
  materials: Material[];
  executions: ProductionExecutionMaterial[];
  equipment?: Equipment[];
}) {
  const router = useRouter();
  const [lots, setLots] = useState<ItemLot[]>(initial);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [materials, setMaterials] = useState<Material[]>(initialMaterials);
  const [execMaterials, setExecMaterials] = useState<ProductionExecutionMaterial[]>(executions);
  const [missingProcessHeaders, setMissingProcessHeaders] = useState<string[]>([]);
  const [missingEquipmentHeaders, setMissingEquipmentHeaders] = useState<string[]>([]);
  const [missingDisposalHeaders, setMissingDisposalHeaders] = useState<string[]>([]);
  // Disposal flow — set when the user clicks 폐기 처리 on a row.
  type DisposalDraft = {
    lot: ItemLot;
    disposalDate: string;
    disposalQty: number;
    disposalReason: string;
    disposalWorker: string;
  };
  const [disposing, setDisposing] = useState<DisposalDraft | null>(null);
  const [disposeBusy, setDisposeBusy] = useState(false);
  const [disposeError, setDisposeError] = useState<string | null>(null);
  // Safe delete (예정 / 보류 only, blocked when exec rows exist).
  const [deleteTarget, setDeleteTarget] = useState<ItemLot | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canDelete = useCanEdit("delete");
  type ConsumptionDiag = {
    isNew: boolean;
    itemNo: string;
    matchedBomRows: number;
    actualMaterialsCount: number;
    actualMaterialsNonZero: number;
    deductionWarning?: string;
    execStatus: "skipped (PATCH)" | "skipped (empty)" | "created" | "failed" | "not-attempted";
    execCount?: number;
    execError?: string;
    skipReason?: string;
  };
  const [consumption, setConsumption] = useState<ConsumptionDiag | null>(null);
  type RoundtripState =
    | { status: "ok"; message: string }
    | { status: "mismatch"; message: string; detail: { sent: Record<string, unknown>; received: Record<string, unknown> } }
    | null;
  const [processRoundtrip, setProcessRoundtrip] = useState<RoundtripState>(null);
  // Auto-dismiss the OK toast after 4s; keep the mismatch toast sticky until
  // the user closes it (they need to read the field list).
  useEffect(() => {
    if (processRoundtrip?.status === "ok") {
      const t = setTimeout(() => setProcessRoundtrip(null), 4000);
      return () => clearTimeout(t);
    }
  }, [processRoundtrip]);
  const canEditProd = useCanEdit("upcycle-production");

  // ─── Probe: which process headers does the 품목생산LOT sheet have? ──
  // Diagnostic — surfaces a visible warning when dispersionDate / qcDate /
  // etc. columns are missing, since those rows otherwise look like they
  // "saved" while silently dropping the process fields.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/upcycle-production?probe=headers", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j?.headers?.missing && Array.isArray(j.headers.missing)) {
          setMissingProcessHeaders(j.headers.missing as string[]);
        }
        if (j?.headers?.missingEquipment && Array.isArray(j.headers.missingEquipment)) {
          setMissingEquipmentHeaders(j.headers.missingEquipment as string[]);
        }
        if (j?.headers?.missingDisposal && Array.isArray(j.headers.missingDisposal)) {
          setMissingDisposalHeaders(j.headers.missingDisposal as string[]);
        }
      } catch { /* silently ignore — non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, []);
  // Two distinct flows share the same logic:
  //   `editing` — null normally; set when the user opens a row's edit modal.
  //   `inline`  — always present; drives the always-visible "Quick LOT 등록"
  //               panel at the top of the page so 작업배수 / 실제 생산수량 /
  //               기준 BOM 사용량 / 추가/감소 투입량 / 최종 실제 투입량 land on
  //               the page directly without any click.
  const [editing, setEditing] = useState<EditableLot | null>(null);
  const [inline, setInline] = useState<EditableLot>(emptyLot());
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  // Opt-in for re-deducting 원료재고 when editing an already-진행중/완료 LOT.
  // OFF by default so metadata-only edits never move stock.
  const [applyMaterialEdit, setApplyMaterialEdit] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/upcycle-production");
  const [savingExec, setSavingExec] = useState(false);
  const [execError, setExecError] = useState<SaveErrorDetail | null>(null);
  void savingExec;

  // History view filter state.
  const [historyItemNo, setHistoryItemNo] = useState<string>("");

  // The active draft — modal takes precedence; otherwise the always-visible
  // inline form. All math (override table, totals, deduction preview) reads
  // from `draft`, and updates write through `setDraft`.
  const draft: EditableLot = editing ?? inline;

  // LOT code preview — recomputed whenever itemNo, date, or the lots list
  // changes. The input value is `draft.lotCode || lotCodePreview`, so the
  // user always sees a current preview until they type or hit "다시 생성".
  const lotCodePreview = useMemo(
    () => generateLotCode(inline.itemNo, inline.date, lots, "UC"),
    [inline.itemNo, inline.date, lots],
  );
  const editingLotCodePreview = useMemo(
    () => editing ? generateLotCode(editing.itemNo, editing.date, lots, "UC") : "",
    [editing, lots],
  );
  function setDraft(updater: EditableLot | ((prev: EditableLot) => EditableLot)) {
    const next = typeof updater === "function"
      ? (updater as (p: EditableLot) => EditableLot)(draft)
      : updater;
    if (editing) setEditing(next);
    else setInline(next);
  }

  // ─── 실제 원료 투입 조정 ─────────────────────────────────
  // Per the latest spec:
  //   materialDeduction = (BOM.qty × multiplier) + adjustmentQty
  //   itemStockIncrease = actualProducedQty
  // 작업배수 (multiplier) defaults to actualProducedQty so a fresh lot deducts
  // BOM × pieces. User can override (e.g. 1.05 for +5%).
  const actualProducedQty = draft?.actualProducedQty ?? 0;
  // 작업배수 is independent. Defaults to 1 (from emptyLot); user adjusts in
  // steps of 0.5. It never silently follows actualProducedQty.
  const multiplier = typeof draft?.multiplier === "number" && draft.multiplier > 0
    ? draft.multiplier
    : 1;

  const baseRows: AdjustmentRow[] = useMemo(() => {
    if (!draft?.itemNo) return [];
    const lines = bom.filter((b) => b.itemNo === draft.itemNo);
    return lines.map((l, idx) => {
      const mat = materials.find(
        (m) => m.id === l.materialId
          || (l.materialCode && (m.materialCode === l.materialCode || m.id === l.materialCode)),
      );
      return {
        // Per-BOM-line key so duplicate materials (same code in 배합/사출) get
        // independent adjustment inputs. Fall back to a composite if id is blank.
        rowKey: l.id || `${l.materialCode || l.materialId}#${idx}`,
        materialId: mat?.id ?? l.materialId,
        materialCode: l.materialCode || l.materialId,
        materialName: l.materialName || mat?.name || "",
        category: mat?.category,
        unit: l.unit || mat?.unit || "",
        stockUnit: mat?.unit || l.unit || "",
        bomPerUnit: l.amountPerUnit,
        adjustmentQty: 0,
        unitCost: mat?.unitCost ?? mat?.unitPrice ?? 0,
        currentStock: mat?.stock ?? 0,
      };
    });
  }, [draft?.itemNo, bom, materials]);

  const adjustmentRows = useMemo(() => {
    return baseRows.map((r) => ({
      ...r,
      adjustmentQty: adjustments[r.rowKey] ?? 0,
      baseTotalQty: r.bomPerUnit * multiplier,
    }));
  }, [baseRows, adjustments, multiplier]);

  const actualSummary = useMemo(() => {
    const rows = adjustmentRows.map((r) => {
      const actualQty = r.baseTotalQty + r.adjustmentQty;
      const materialCost = actualQty * r.unitCost;
      // ─── Unit-aware stock check ────────────────────────
      // r.currentStock is in r.stockUnit (e.g. "kg"). actualQty is in
      // r.unit (e.g. "g"). Convert stock → usage unit for the comparison,
      // then convert remaining back to stock unit for the writeback hint.
      const usageUnit = r.unit;
      const stockUnit = r.stockUnit || r.unit;
      const stockInUsage = convertQty(r.currentStock, stockUnit, usageUnit);
      const unitsCompatible = stockInUsage.compatible;
      const normalizedAvailable = unitsCompatible ? stockInUsage.qty : NaN;
      const normalizedRemaining = unitsCompatible
        ? normalizedAvailable - actualQty
        : NaN;
      // Convert the remaining back to stock unit for writeback display.
      const stockAfter = unitsCompatible
        ? convertQty(normalizedRemaining, usageUnit, stockUnit).qty
        : r.currentStock; // can't compute when incompatible — show raw stock
      return {
        ...r,
        actualQty,
        materialCost,
        stockAfter,
        unitsCompatible,
        normalizedAvailable,
        normalizedRemaining,
        usageUnit,
        stockUnit,
      };
    });
    const totalMaterialCost = rows.reduce((s, r) => s + r.materialCost, 0);
    const unitCost = actualProducedQty > 0 ? totalMaterialCost / actualProducedQty : 0;
    // Distinguish "negative-but-compatible" (genuine shortage) from
    // "incompatible-units" (data problem) so the UI can label them
    // separately. Compatible rows where actualQty=0 are never negative.
    const insufficient = rows.filter((r) => r.unitsCompatible && r.normalizedRemaining < 0);
    const incompatible = rows.filter((r) => !r.unitsCompatible);
    return { rows, totalMaterialCost, unitCost, insufficient, incompatible };
  }, [adjustmentRows, actualProducedQty]);

  function lotHasExecRows(l: ItemLot): boolean {
    return execMaterials.some(
      (e) => (e.lotId && e.lotId === l.id) || (e.lotNo && l.lotCode && e.lotNo === l.lotCode),
    );
  }

  function openDelete(l: ItemLot) {
    if (l.status !== "예정" && l.status !== "보류") return;
    setDeleteTarget(l);
    setDeleteError(null);
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/upcycle-production?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setDeleteError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const updated = json.data as ItemLot | undefined;
      if (updated && updated.id) {
        // Soft delete — server flipped status to "삭제됨". Apply locally and
        // filter from the visible list via the table-level filter.
        setLots((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      }
      router.refresh();
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  function openDispose(l: ItemLot) {
    if (l.status !== "진행중" && l.status !== "완료") return;
    // Default 폐기 담당자 = existing assignee if it's a registered production
    // worker, otherwise the first worker in the list (정선희). Anything else
    // (e.g. legacy "제조팀") would never be in the dropdown's option list,
    // so we keep it as a (기존) fallback option but pre-select the canonical
    // first worker so the field is valid on first open.
    const prodWorkers = getProductionWorkers();
    const preSelected = (l.assignee && prodWorkers.includes(l.assignee))
      ? l.assignee
      : (prodWorkers[0] ?? "");
    setDisposing({
      lot: l,
      disposalDate: todayISO(),
      disposalQty: l.actualProducedQty ?? l.completedQty ?? 0,
      disposalReason: "",
      disposalWorker: preSelected,
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
      const res = await fetch("/api/upcycle-production", {
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
      const updated = json.data as ItemLot | undefined;
      if (updated && updated.id) {
        setLots((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      }
      // Refresh items so 품목재고 reflects the reversal.
      fetch("/api/upcycle-items", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => { if (Array.isArray(j.data)) setItems(j.data); })
        .catch(() => { /* keep stale */ });
      router.refresh();
      setDisposing(null);
    } catch (err) {
      setDisposeError((err as Error).message);
    } finally {
      setDisposeBusy(false);
    }
  }

  async function onSave() {
    if (!draft) return;
    setWarning(null);
    setExecError(null);
    const isModal = !!editing;
    const isNew = !draft.id;

    if (!draft.itemNo) {
      setWarning("품목번호를 먼저 선택하세요.");
      return;
    }

    // Pack the explicit actualMaterials list so the server deducts based on
    // it (NOT BOM × targetQty, NOT productionUnit).
    const actualMaterialsPayload = actualSummary.rows.map((r) => ({
      materialCode: r.materialCode,
      materialName: r.materialName,
      actualQty: r.actualQty,
      // Usage unit (BOM-side). Server uses this with material.unit to
      // convert actualQty back into the storage unit before deducting.
      unit: r.unit,
    }));
    // Resolve the LOT code at save time so the user sees exactly what gets
    // written. Manual override wins; otherwise fall back to the live preview;
    // otherwise the server still generates one as a last resort.
    const draftPreview = generateLotCode(draft.itemNo, draft.date, lots, "UC");
    const resolvedLotCode = (draft.lotCode ?? "").trim() || draftPreview;
    const lotPayload = {
      ...draft,
      lotCode: resolvedLotCode,
      multiplier,
      actualProducedQty,
      actualMaterials: actualMaterialsPayload,
      actualMaterialTotalCost: Math.round(actualSummary.totalMaterialCost),
      actualUnitCost: Math.round(actualSummary.unitCost),
      // Only an explicit, in-modal "실투입량 정정" edit re-deducts stock. New
      // LOTs (POST) deduct unconditionally and ignore this flag server-side.
      applyMaterialEdit: isModal && applyMaterialEdit,
    };
    // process-fields roundtrip — sent snapshot kept for mismatch detection.
    const sentProcess = {
      dispersionDate: lotPayload.dispersionDate,
      dispersionWorker: lotPayload.dispersionWorker,
      injectionDate: lotPayload.injectionDate,
      injectionWorker: lotPayload.injectionWorker,
      qcDate: lotPayload.qcDate,
      qcWorker: lotPayload.qcWorker,
    };

    // consumption pipeline diag.
    const bomForItem = bom.filter((b) => b.itemNo === draft.itemNo);
    const nonZero = actualMaterialsPayload.filter((m) => m.actualQty !== 0).length;
    const diag: ConsumptionDiag = {
      isNew,
      itemNo: draft.itemNo,
      matchedBomRows: bomForItem.length,
      actualMaterialsCount: actualMaterialsPayload.length,
      actualMaterialsNonZero: nonZero,
      execStatus: "not-attempted",
    };

    const res = await save<ItemLot>(isNew ? "POST" : "PATCH", lotPayload);
    if (!res.ok) {
      setConsumption({ ...diag, skipReason: "LOT save failed — see error panel above." });
      return;
    }
    const savedLot = (res.data as ItemLot | undefined) ?? null;
    diag.deductionWarning = res.warning;
    // Surface server warning (e.g. "원료 재고 부족 — N종 (LOT은 생성됨)"
    // or "actualMaterials empty …"). Previously dropped by the save hook.
    if (res.warning) {
      setWarning(res.warning);
    }

    // ─── [DEBUG] process-fields roundtrip — received & compared ───
    if (savedLot) {
      const receivedProcess = {
        dispersionDate: savedLot.dispersionDate ?? "",
        dispersionWorker: savedLot.dispersionWorker ?? "",
        injectionDate: savedLot.injectionDate ?? "",
        injectionWorker: savedLot.injectionWorker ?? "",
        qcDate: savedLot.qcDate ?? "",
        qcWorker: savedLot.qcWorker ?? "",
      };
      const keys: Array<keyof typeof sentProcess> = [
        "dispersionDate", "dispersionWorker",
        "injectionDate", "injectionWorker",
        "qcDate", "qcWorker",
      ];
      const sentFilled = keys.filter((k) => (sentProcess[k] ?? "") !== "");
      const mismatched = keys.filter(
        (k) => (sentProcess[k] ?? "") !== (receivedProcess[k] ?? ""),
      );
      if (sentFilled.length === 0) {
        // user didn't enter any process fields — nothing to report
      } else if (mismatched.length === 0) {
        setProcessRoundtrip({ status: "ok", message: `process fields saved: ${sentFilled.join(", ")}` });
      } else {
        setProcessRoundtrip({
          status: "mismatch",
          message: `process fields NOT persisted: ${mismatched.join(", ")} — sheet column likely missing or named differently`,
          detail: { sent: sentProcess, received: receivedProcess },
        });
      }
    }

    // Append the per-material audit row (append-only, never modifies BOM).
    // ─── PATCH guard ────────────────────────────────────────────
    // On edit (existing LOT), skip the exec append entirely. The 품목생산
    // 투입원료 rows for this LOT were already written when the LOT was first
    // created; appending again would duplicate. Process-field edits and
    // status changes are metadata-only and never re-deduct or re-record.
    const lotId = savedLot?.id ?? draft.id ?? "";
    const lotNo = savedLot?.lotCode ?? draft.lotCode ?? "";
    if (!isNew) {
      diag.execStatus = "skipped (PATCH)";
      diag.skipReason = "기존 LOT 편집(PATCH)은 품목생산투입원료를 다시 기록하지 않습니다 (중복 방지).";
    } else if (!lotId) {
      diag.execStatus = "skipped (empty)";
      diag.skipReason = "저장된 LOT id가 비어 있어 품목생산투입원료를 기록하지 못했습니다.";
    } else if (adjustmentRows.length === 0) {
      diag.execStatus = "skipped (empty)";
      diag.skipReason = bomForItem.length === 0
        ? `품목 ${draft.itemNo}번에 대한 BOM 행이 없습니다. 먼저 /bom 에서 BOM을 등록하세요.`
        : "BOM 매칭은 되었지만 adjustmentRows가 비었습니다 (예상치 못한 상태).";
    } else if (isNew && lotId) {
      setSavingExec(true);
      try {
        const payload = {
          rows: actualSummary.rows.map((r) => ({
            lotId,
            lotNo,
            itemNo: draft.itemNo,
            materialCode: r.materialCode,
            materialName: r.materialName,
            baseQty: r.bomPerUnit,
            multiplier,
            baseTotalQty: r.baseTotalQty,
            adjustmentQty: r.adjustmentQty,
            actualQty: r.actualQty,
            unit: r.unit,
            unitCost: r.unitCost,
            materialCost: r.materialCost,
            note: "",
          })),
        };
        const exResp = await fetch("/api/upcycle-production-execution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const exJson = await exResp.json().catch(() => ({}));
        if (!exResp.ok || exJson.error) {
          diag.execStatus = "failed";
          diag.execError = exJson.error ?? `HTTP ${exResp.status}`;
          setExecError({
            message: `[Step 2] 품목생산투입원료 저장 실패: ${diag.execError}`,
            sheetName: exJson.sheetName ?? "품목생산투입원료",
            appsScript: exJson.appsScript,
          });
        } else if (Array.isArray(exJson.data)) {
          diag.execStatus = "created";
          diag.execCount = (exJson.data as ProductionExecutionMaterial[]).length;
          setExecMaterials((prev) => [...prev, ...(exJson.data as ProductionExecutionMaterial[])]);
        } else {
          diag.execStatus = "failed";
          diag.execError = "응답에 data 배열이 없습니다.";
        }
      } catch (err) {
        diag.execStatus = "failed";
        diag.execError = (err as Error).message;
        setExecError({ message: `[Step 2] 네트워크 오류: ${(err as Error).message}` });
      } finally {
        setSavingExec(false);
      }
    }
    setConsumption(diag);

    // Refetch all four affected sheets in parallel — local state is the
    // source of truth for what the page renders, so updated material stocks
    // and item stocks appear immediately without a full page reload.
    try {
      const [lotsRes, matsRes, itemsRes, execRes] = await Promise.all([
        fetch("/api/upcycle-production", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/upcycle-materials",       { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/upcycle-items",           { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/upcycle-production-execution", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      ]);
      if (Array.isArray(lotsRes.data)) setLots(lotsRes.data);
      if (Array.isArray(matsRes.data)) setMaterials(matsRes.data);
      if (Array.isArray(itemsRes.data)) setItems(itemsRes.data);
      if (Array.isArray(execRes.data)) setExecMaterials(execRes.data);
    } catch { /* keep stale */ }
    router.refresh();
    if (!execError) {
      if (isModal) setEditing(null);
      else setInline(emptyLot()); // reset for the next LOT
      setAdjustments({});
      setApplyMaterialEdit(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="업사이클 생산"
        description="업사이클 생산 LOT 기준으로 업사이클 원료가 차감되고 업사이클 품목 재고가 증가합니다."
      />

      {(missingProcessHeaders.length > 0 || missingEquipmentHeaders.length > 0) && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-900">
          <div className="font-semibold">⚠ 품목생산LOT 시트에 누락된 process 컬럼이 있습니다</div>
          {missingProcessHeaders.length > 0 && (
            <div className="mt-0.5">
              공정/담당자: <span className="font-mono">{missingProcessHeaders.join(", ")}</span>
            </div>
          )}
          {missingEquipmentHeaders.length > 0 && (
            <div className="mt-0.5">
              설비/장비: <span className="font-mono">{missingEquipmentHeaders.join(", ")}</span>
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-red-800">
            품목생산LOT 시트의 헤더 행에 이 컬럼들을 추가하기 전까지 해당 값은 저장되지 않습니다.
            (스키마 검증은 자동으로 일어나며 컬럼 자동 생성은 하지 않습니다.)
          </div>
        </div>
      )}

      {consumption && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-[12px] flex items-start gap-2 ${
          consumption.execStatus === "created" && !consumption.deductionWarning
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : consumption.execStatus === "failed"
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
        }`}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold mb-1">
              [consume] {consumption.execStatus === "created" ? "✓" : "⚠"} 원료 차감 / 품목생산투입원료
            </div>
            <div className="text-[11px] font-mono leading-relaxed">
              <div>itemNo: <b>{consumption.itemNo || "(empty)"}</b> · isNew: <b>{String(consumption.isNew)}</b></div>
              <div>matchedBomRows: <b className={consumption.matchedBomRows === 0 ? "text-red-700" : ""}>{consumption.matchedBomRows}</b> · actualMaterials: <b>{consumption.actualMaterialsCount}</b> ({consumption.actualMaterialsNonZero} non-zero)</div>
              <div>execStatus: <b>{consumption.execStatus}</b>{consumption.execCount != null ? ` · created ${consumption.execCount}건` : ""}</div>
              {consumption.deductionWarning && <div>deduction: <b>{consumption.deductionWarning}</b></div>}
              {consumption.execError && <div>execError: <b className="text-red-700">{consumption.execError}</b></div>}
              {consumption.skipReason && <div>skipReason: <b>{consumption.skipReason}</b></div>}
            </div>
          </div>
          <button onClick={() => setConsumption(null)} className="shrink-0 text-ink-500 hover:text-ink-900" title="닫기">×</button>
        </div>
      )}

      {processRoundtrip && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-[12px] flex items-start gap-2 ${
          processRoundtrip.status === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900"
        }`}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">
              {processRoundtrip.status === "ok" ? "✓ " : "⚠ "}{processRoundtrip.message}
            </div>
            {processRoundtrip.status === "mismatch" && (
              <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all bg-bg-panel/60 border border-amber-200 rounded p-1.5">
{JSON.stringify(processRoundtrip.detail, null, 2)}
              </pre>
            )}
          </div>
          <button onClick={() => setProcessRoundtrip(null)} className="shrink-0 text-ink-500 hover:text-ink-900" title="닫기">×</button>
        </div>
      )}

      {/* ─── 항상 보이는 인라인 LOT 등록 패널 ───────────────────── */}
      <div className="panel mb-6">
        <div className="px-4 py-3 border-b border-border bg-bg-subtle/50 flex items-center gap-2 text-sm font-semibold">
          <Plus size={14} className="text-ink-500" /> 새 LOT 등록
          <span className="ml-2 text-[11px] font-normal text-ink-500">
            원료 차감 = (BOM × 작업배수) + 추가/감소 · 품목 재고 증가 = 실제 생산수량
          </span>
        </div>
        <SaveErrorPanel error={saveError} onClose={clearError} />

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="label">품목번호</label>
              <select className="input" value={inline.itemNo}
                onChange={(e) => setInline({ ...inline, itemNo: e.target.value })}>
                <option value="">선택...</option>
                {items.filter((i) => i.status === "사용중")
                  .sort((a, b) => Number(a.itemNo) - Number(b.itemNo))
                  .map((i) => (
                    <option key={i.itemNo} value={i.itemNo}>
                      {i.itemNo}번 · {i.colorName} ({i.productType})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label">작업배수 (multiplier)</label>
              <div className="flex items-stretch gap-1">
                <button type="button"
                  className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-sm font-semibold"
                  disabled={(inline.multiplier ?? 1) <= 0.5}
                  onClick={() => setInline({ ...inline, multiplier: Math.max(0.5, Number(((inline.multiplier ?? 1) - 0.5).toFixed(2))) })}
                  title="-0.5">−</button>
                <input className="input text-right tabular-nums flex-1" type="number" min={0.5} step={0.5}
                  value={inline.multiplier ?? 1}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? 1 : Number(raw);
                    setInline({ ...inline, multiplier: Number.isFinite(n) && n >= 0.5 ? n : 0.5 });
                  }} />
                <button type="button"
                  className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel text-sm font-semibold"
                  onClick={() => setInline({ ...inline, multiplier: Number(((inline.multiplier ?? 1) + 0.5).toFixed(2)) })}
                  title="+0.5">+</button>
              </div>
              <div className="text-[10px] text-ink-500 mt-0.5">
                기준량 = BOM × {multiplier} · 0.5 단위로 조정
              </div>
            </div>
            <div>
              <label className="label">실제 생산수량 (actualProducedQty)</label>
              <input className="input text-right tabular-nums" type="number" min={0}
                value={inline.actualProducedQty ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  setInline({ ...inline, actualProducedQty: raw === "" ? undefined : Number(raw) });
                }} />
            </div>
            <div>
              <label className="label">생산일</label>
              <input className="input" type="date" value={inline.date}
                onChange={(e) => setInline({ ...inline, date: e.target.value })} />
            </div>
            <div>
              <label className="label">담당자</label>
              <input className="input" value={inline.assignee}
                onChange={(e) => setInline({ ...inline, assignee: e.target.value })} />
            </div>
            <div>
              <label className="label">상태</label>
              <select className="input" value={inline.status}
                onChange={(e) => setInline({ ...inline, status: e.target.value as LotStatus })}>
                {LOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="label">메모</label>
              <input className="input" value={inline.note}
                onChange={(e) => setInline({ ...inline, note: e.target.value })} />
            </div>
            <div className="lg:col-span-4">
              <label className="label flex items-center gap-2 flex-wrap">
                <span>LOT 번호 <span className="text-[10px] text-ink-500 font-normal">— LOT-{`{itemNo}`}-YYYYMMDD-순번</span></span>
                <span className="text-[11px] sm:text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                  ⚠ 자동 생성되니 손대지 말 것
                </span>
              </label>
              <div className="flex items-stretch gap-1">
                <input
                  className="input flex-1 font-mono"
                  value={inline.lotCode ?? ""}
                  placeholder={lotCodePreview || "품목번호와 생산일을 먼저 입력하세요"}
                  onChange={(e) => setInline({ ...inline, lotCode: e.target.value })}
                />
                <button
                  type="button"
                  className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-xs font-medium whitespace-nowrap"
                  disabled={!lotCodePreview}
                  onClick={() => setInline({ ...inline, lotCode: lotCodePreview })}
                  title="현재 입력값으로 LOT 번호를 다시 생성"
                >LOT 번호 다시 생성</button>
              </div>
              <div className="text-[10px] text-ink-500 mt-0.5">
                미입력 시 저장 시점에 자동으로 <span className="font-mono">{lotCodePreview || "—"}</span>
                {" "}형식으로 생성됩니다. 수동 입력 시 그대로 사용됩니다.
              </div>
            </div>
          </div>

          {/* ─── 공정 추적 (분산 · 사출 · QC) ───────────────────── */}
          <ProcessTrackingPanel
            value={inline}
            equipment={equipment}
            onChange={(patch) => setInline({ ...inline, ...patch })}
            defaultInjectionDate={inline.date}
          />

          {/* 원료재고 차감 미리보기 + 품목재고 증가 미리보기 */}
          {draft.itemNo ? (
            adjustmentRows.length > 0 ? (
              <div className="rounded-md border border-border overflow-x-auto">
                <div className="px-3 py-2 text-xs font-semibold bg-bg-subtle/60 border-b border-border">
                  원료재고 차감 미리보기 · 품목 ({draft.itemNo}번) BOM {adjustmentRows.length}종
                </div>
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-th">materialCode</th>
                    <th className="table-th">materialName</th>
                    <th className="table-th text-right">기준 BOM 사용량</th>
                    <th className="table-th text-right">× 작업배수 = 기준량</th>
                    <th className="table-th text-right">추가/감소</th>
                    <th className="table-th text-right">실 투입량 (차감량)</th>
                    <th className="table-th text-right">stock before</th>
                    <th className="table-th text-right">stock after</th>
                    <th className="table-th text-right">단가</th>
                    <th className="table-th text-right">원료비</th>
                  </tr></thead>
                  <tbody>
                    {actualSummary.rows.map((r) => (
                      <tr key={r.rowKey}>
                        <td className="table-td font-mono text-xs text-ink-900">{r.materialCode || <span className="text-red-700">(없음)</span>}</td>
                        <td className="table-td">
                          <div className="font-medium text-ink-900">{r.materialName}</div>
                          {r.category && <div className="text-[10px] text-ink-500">{r.category}</div>}
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatNumber(r.bomPerUnit)} <span className="text-[10px] text-ink-500">{r.unit}</span>
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatNumber(r.baseTotalQty)} <span className="text-[10px] text-ink-500">{r.unit}</span>
                        </td>
                        <td className="table-td text-right">
                          <input className="input text-right tabular-nums w-20" type="number" step="0.01"
                            value={adjustments[r.rowKey] ?? 0}
                            onChange={(e) => setAdjustments((prev) => ({
                              ...prev, [r.rowKey]: Number(e.target.value),
                            }))} />
                        </td>
                        <td className={`table-td text-right tabular-nums font-medium ${r.actualQty < 0 ? "text-red-700" : ""}`}>
                          −{formatNumber(r.actualQty)} <span className="text-[10px] text-ink-500">{r.unit}</span>
                        </td>
                        <td className="table-td text-right tabular-nums text-ink-700">
                          {formatNumber(r.currentStock)} <span className="text-[10px] text-ink-500">{r.stockUnit}</span>
                          {r.unitsCompatible && r.stockUnit !== r.usageUnit && (
                            <div className="text-[10px] text-ink-400">= {formatNumber(r.normalizedAvailable)} {r.usageUnit}</div>
                          )}
                        </td>
                        <td className={`table-td text-right tabular-nums ${!r.unitsCompatible ? "text-red-700" : (r.normalizedRemaining < 0 ? "text-red-700 font-medium" : "")}`}>
                          {r.unitsCompatible
                            ? <>{formatNumber(r.stockAfter)} <span className="text-[10px] text-ink-500">{r.stockUnit}</span></>
                            : <span title={`stock ${r.stockUnit} ≠ usage ${r.usageUnit}`}>단위 불일치</span>}
                          {r.unitsCompatible && r.stockUnit !== r.usageUnit && (
                            <div className="text-[10px] text-ink-400">= {formatNumber(r.normalizedRemaining)} {r.usageUnit}</div>
                          )}
                        </td>
                        <td className="table-td text-right tabular-nums text-ink-700">{formatCurrency(r.unitCost)}</td>
                        <td className="table-td text-right tabular-nums">{formatCurrency(r.materialCost)}</td>
                      </tr>
                    ))}
                    <tr className="bg-bg-subtle">
                      <td className="table-td font-semibold" colSpan={9}>실제 총 투입 원료비</td>
                      <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(actualSummary.totalMaterialCost)}</td>
                    </tr>
                  </tbody>
                </table>
                <ShortageDebugPanel insufficient={actualSummary.insufficient} incompatible={actualSummary.incompatible} />
                {/* Legacy summary line — concise count */}
                {actualSummary.insufficient.length > 0 && (
                  <div className="px-3 py-2 text-[11px] text-red-800 bg-red-50 border-t border-red-200">
                    ⚠ {actualSummary.insufficient.length}종 원료의 차감 후 재고가 음수입니다.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                선택한 품목의 BOM이 비어 있어 원료 차감 미리보기를 표시할 수 없습니다.
              </div>
            )
          ) : (
            <div className="text-xs text-ink-500 bg-bg-subtle/50 border border-border rounded p-3">
              위에서 품목번호와 실제 생산수량을 입력하면 원료 차감 미리보기와 실제 1개 원가가 여기에 표시됩니다.
            </div>
          )}

          {/* 품목재고 증가 + 실제 1개 원가 박스 */}
          {draft.itemNo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-bg-subtle p-3">
                <div className="text-[11px] uppercase tracking-wider text-ink-500">품목재고 증가 (미리보기)</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {actualProducedQty > 0
                    ? `+${actualProducedQty.toLocaleString("ko-KR")}`
                    : <span className="text-ink-400 text-base">실제 생산수량 미입력</span>}
                  {actualProducedQty > 0 && <span className="text-sm ml-1 text-ink-600">{items.find((i) => i.itemNo === draft.itemNo)?.unit ?? "개"}</span>}
                </div>
                <div className="text-[11px] text-ink-500 mt-0.5">
                  상태가 <b>완료</b>일 때 품목마스터.stock에 적용됩니다.
                </div>
              </div>
              <div className="rounded-md border-2 border-ink-900 bg-ink-900 text-bg p-3">
                <div className="text-[11px] uppercase tracking-wider opacity-80">실제 1개 원가</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {actualProducedQty > 0 ? formatCurrency(actualSummary.unitCost) : "—"}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  실제 총 투입 원료비 ÷ 실제 생산수량
                </div>
              </div>
            </div>
          )}

          {warning && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{warning}</div>
          )}
          <SaveErrorPanel error={execError} onClose={() => setExecError(null)} />

          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setInline(emptyLot()); setAdjustments({}); }}>
              초기화
            </button>
            <button className="btn-primary" onClick={onSave}
              disabled={saving || !canEditProd || !inline.itemNo}
              title={!canEditProd ? PERMISSION_TIP : !inline.itemNo ? "품목번호를 먼저 선택하세요." : undefined}
            >{saving ? "저장 중..." : "LOT 저장"}</button>
          </div>
        </div>
      </div>

      <div className="text-xs text-ink-500 mb-2">
        등록된 LOT 목록 (실제 생산수량과 작업배수 기준)
      </div>
      <Table>
        <THead>
          <TR>
            <TH>생산일</TH><TH>품목번호</TH><TH>품목</TH><TH>LOT</TH>
            <TH className="text-right">실제 생산수량</TH>
            <TH className="text-right">작업배수</TH>
            <TH className="text-right">실제 1개 원가</TH>
            <TH>담당자</TH><TH>공정</TH><TH>상태</TH><TH></TH>
          </TR>
        </THead>
        <TBody>
          {(() => {
            // Hide soft-deleted LOTs from the default list. They remain in
            // the sheet for audit; the row's `status` is just "삭제됨".
            const allVisible = lots.filter((l) => l.status !== "삭제됨");
            const visible = allVisible.slice(0, visibleCount);
            if (allVisible.length === 0) return <Empty>생산 LOT이 없습니다.</Empty>;
            return visible.map((l) => {
              const it = items.find((i) => i.itemNo === l.itemNo);
              return (
                <TR key={l.id}>
                  <TD>{formatDateKst(l.date)}</TD>
                  <TD><span className="font-mono font-semibold">{l.itemNo}</span></TD>
                  <TD>
                    <div className="font-medium text-ink-900">{it?.colorName ?? "-"}</div>
                    <div className="text-[11px] text-ink-500">{l.productType}</div>
                  </TD>
                  <TD className="font-mono text-xs text-ink-700">{l.lotCode}</TD>
                  {/*
                    Render rule (per spec):
                      - value != null → render the value (including 0)
                      - value == null → "—"
                    The previous guards used `&& v > 0` which incorrectly
                    treated a legitimate 0 as "missing".
                  */}
                  <TD className="text-right tabular-nums">
                    {l.actualProducedQty != null
                      ? <>{formatNumber(l.actualProducedQty)} <span className="text-[10px] text-ink-500">{it?.unit ?? "개"}</span></>
                      : <span className="text-ink-400">—</span>}
                    {l.defectQty > 0 && <div className="text-[11px] text-red-600">불량 {l.defectQty}</div>}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {l.multiplier != null
                      ? formatNumber(l.multiplier)
                      : <span className="text-ink-400">—</span>}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {l.actualUnitCost != null
                      ? formatCurrency(l.actualUnitCost)
                      : <span className="text-ink-400">—</span>}
                  </TD>
                  <TD>{l.assignee}</TD>
                  <TD className="w-[220px] max-w-[220px] align-top">
                    <ProcessBadges lot={l} />
                  </TD>
                  <TD className="align-top">
                    {l.status === "폐기"
                      ? (() => {
                          const disposalWorkerDisplay = l.disposalWorker || l.assignee || "(미지정)";
                          const tooltip = [
                            "폐기 처리",
                            `폐기일: ${l.disposalDate ? formatDateKst(l.disposalDate) : "(미지정)"}`,
                            `폐기수량: ${l.disposalQty ?? "(미지정)"}`,
                            `폐기사유: ${l.disposalReason || "(미지정)"}`,
                            `폐기담당자: ${disposalWorkerDisplay}`,
                          ].join("\n");
                          return (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-800 border-red-300 font-semibold"
                              title={tooltip}>
                              폐기
                              {l.disposalQty != null && l.disposalQty !== 0 && (
                                <span className="font-normal text-red-700">· {formatNumber(l.disposalQty)}개</span>
                              )}
                            </span>
                          );
                        })()
                      : <StatusBadge status={mapStatus(l.status)} />}
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-2">
                      {(l.status === "예정" || l.status === "보류") && (
                        (() => {
                          const blocked = lotHasExecRows(l);
                          return (
                            <button
                              onClick={() => openDelete(l)}
                              disabled={!canDelete || blocked}
                              className="text-ink-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={blocked
                                ? "이미 원료 사용 이력이 있어 삭제할 수 없습니다. 폐기 처리하세요."
                                : canDelete ? "삭제 (예정/보류만)" : PERMISSION_TIP}
                            ><X size={14} /></button>
                          );
                        })()
                      )}
                      {(l.status === "진행중" || l.status === "완료") && (
                        <button
                          onClick={() => openDispose(l)}
                          disabled={!canEditProd}
                          className="text-ink-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canEditProd ? "폐기 처리" : PERMISSION_TIP}
                        ><Trash2 size={14} /></button>
                      )}
                      <button
                        onClick={() => { setEditing({ ...l }); setWarning(null); setAdjustments({}); setApplyMaterialEdit(false); }}
                        disabled={!canEditProd || l.status === "폐기"}
                        className="text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={l.status === "폐기" ? "폐기된 LOT은 편집할 수 없습니다." : canEditProd ? "편집" : PERMISSION_TIP}
                      ><Pencil size={14} /></button>
                    </div>
                  </TD>
                </TR>
              );
            });
          })()}
        </TBody>
      </Table>

      {(() => {
        const total = lots.filter((l) => l.status !== "삭제됨").length;
        if (total > visibleCount) {
          return (
            <div className="mt-3 text-center">
              <button className="btn-ghost text-xs"
                onClick={() => setVisibleCount((n) => n + 50)}>
                더 보기 ({visibleCount} / {total})
              </button>
            </div>
          );
        }
        if (total > 50) {
          return (
            <div className="mt-3 text-center text-[11px] text-ink-500">
              전체 {total}건 표시 중
            </div>
          );
        }
        return null;
      })()}

      <Modal open={!!disposing} onClose={() => { if (!disposeBusy) { setDisposing(null); setDisposeError(null); } }}
        title={disposing ? `폐기 처리 — ${disposing.lot.lotCode}` : ""}
        width="max-w-lg"
        footer={<>
          <button className="btn-ghost" disabled={disposeBusy}
            onClick={() => { setDisposing(null); setDisposeError(null); }}>취소</button>
          <button className="btn-primary" disabled={disposeBusy || !disposing?.disposalReason.trim() || !disposing?.disposalWorker.trim()}
            onClick={submitDispose}>
            {disposeBusy ? "처리 중..." : "폐기 확정"}
          </button>
        </>}>
        {disposing && (
          <div className="space-y-3">
            <div className="text-[12px] text-red-900 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <div className="font-semibold mb-0.5">⚠ 이 LOT을 폐기 처리합니다.</div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5">
                <li>품목재고에서 폐기 수량만큼 차감됩니다 (한 번만, 중복 폐기 자동 방지).</li>
                <li>원료재고와 품목생산투입원료 기록은 그대로 유지됩니다.</li>
                <li>폐기된 LOT은 더 이상 편집할 수 없습니다.</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">LOT</label>
                <div className="input bg-bg-subtle font-mono text-xs">{disposing.lot.lotCode}</div>
              </div>
              <div>
                <label className="label">현재 상태</label>
                <div className="input bg-bg-subtle">{disposing.lot.status}</div>
              </div>
              <div>
                <label className="label">폐기일</label>
                <input className="input" type="date"
                  value={disposing.disposalDate}
                  onChange={(e) => setDisposing({ ...disposing, disposalDate: e.target.value })} />
              </div>
              <div>
                <label className="label">폐기 수량 <span className="text-[10px] text-ink-500">기본: actualProducedQty</span></label>
                <input className="input text-right tabular-nums" type="number" min={0}
                  value={disposing.disposalQty}
                  onChange={(e) => setDisposing({ ...disposing, disposalQty: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2">
                <label className="label">폐기 사유 <span className="text-red-700">*</span></label>
                <textarea className="input min-h-[60px]"
                  value={disposing.disposalReason}
                  onChange={(e) => setDisposing({ ...disposing, disposalReason: e.target.value })}
                  placeholder="예: 색상 불량, 점도 불량, 분산 실패, …" />
              </div>
              <div className="col-span-2">
                <label className="label">폐기 담당자 <span className="text-red-700">*</span></label>
                {(() => {
                  const prodWorkers = getProductionWorkers();
                  const current = disposing.disposalWorker.trim();
                  const known = current && prodWorkers.includes(current);
                  return (
                    <select className="input"
                      value={current}
                      onChange={(e) => setDisposing({ ...disposing, disposalWorker: e.target.value })}>
                      <option value="">— 담당자 선택 —</option>
                      {prodWorkers.map((w) => <option key={w} value={w}>{w}</option>)}
                      {current && !known && (
                        <option value={current}>{current} (기존)</option>
                      )}
                    </select>
                  );
                })()}
              </div>
            </div>
            {missingDisposalHeaders.length > 0 && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠ 품목생산LOT 시트에 다음 컬럼이 없습니다: <span className="font-mono">{missingDisposalHeaders.join(", ")}</span>.
                추가 후 저장하면 폐기 정보가 시트에 기록됩니다.
              </div>
            )}
            {disposeError && (
              <div className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                {disposeError}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(null); } }}
        title={deleteTarget ? `LOT 삭제 — ${deleteTarget.lotCode}` : ""}
        width="max-w-md"
        footer={<>
          <button className="btn-ghost" disabled={deleteBusy}
            onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>취소</button>
          <button className="btn-primary" disabled={deleteBusy || !canDelete}
            onClick={submitDelete}>
            {deleteBusy ? "삭제 중..." : "삭제 확정"}
          </button>
        </>}>
        {deleteTarget && (
          <div className="space-y-3 text-sm">
            <div className="text-[12px] text-ink-800 bg-bg-subtle border border-border rounded-md px-3 py-2 leading-relaxed">
              이 LOT는 아직 재고 반영 전 상태입니다. 삭제하시겠습니까?
            </div>
            <div className="text-[11px] text-ink-600 leading-relaxed">
              <ul className="list-disc list-inside space-y-0.5">
                <li>예정 / 보류 상태의 LOT만 삭제할 수 있습니다 (현재: <b className="text-ink-900">{deleteTarget.status}</b>).</li>
                <li>원료재고 / 품목재고 / 품목생산투입원료 기록은 변경되지 않습니다.</li>
                <li>이미 사용된 LOT은 폐기 처리하세요.</li>
              </ul>
            </div>
            {!canDelete && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {PERMISSION_TIP} — 삭제 권한이 필요합니다.
              </div>
            )}
            {deleteError && (
              <div className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
                {deleteError}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title={editing?.id ? "품목 생산 LOT 편집" : "새 품목 생산 LOT"}
        width="max-w-3xl"
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || !canEditProd}
            title={!canEditProd ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">생산일</label>
                <input className="input" type="date" value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></div>
              <div><label className="label">담당자</label>
                <input className="input" value={editing.assignee}
                  onChange={(e) => setEditing({ ...editing, assignee: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">품목번호</label>
                <select className="input" value={editing.itemNo}
                  onChange={(e) => setEditing({ ...editing, itemNo: e.target.value })}>
                  <option value="">선택...</option>
                  {items.filter((i) => i.status === "사용중").sort((a, b) => Number(a.itemNo) - Number(b.itemNo)).map((i) => (
                    <option key={i.itemNo} value={i.itemNo}>{i.itemNo}번 · {i.colorName} ({i.productType})</option>
                  ))}
                </select></div>
              <div className="col-span-2">
                <label className="label flex items-center gap-2 flex-wrap">
                  <span>LOT 번호 <span className="text-[10px] text-ink-500 font-normal">— LOT-{`{itemNo}`}-YYYYMMDD-순번</span></span>
                  <span className="text-[11px] sm:text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                    ⚠ 자동 생성되니 손대지 말 것
                  </span>
                </label>
                <div className="flex items-stretch gap-1">
                  <input className="input flex-1 font-mono"
                    value={editing.lotCode ?? ""}
                    placeholder={editingLotCodePreview || "—"}
                    onChange={(e) => setEditing({ ...editing, lotCode: e.target.value })} />
                  <button type="button"
                    className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-xs font-medium whitespace-nowrap"
                    disabled={!editingLotCodePreview}
                    onClick={() => setEditing({ ...editing, lotCode: editingLotCodePreview })}
                  >LOT 번호 다시 생성</button>
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5">
                  기존 LOT 번호는 그대로 유지됩니다. 수정해야 할 때만 다시 생성하세요.
                </div>
              </div>
              <div><label className="label">상태</label>
                <select className="input" value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as LotStatus })}>
                  {LOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
              <div><label className="label text-ink-500">불량 수량 (선택)</label>
                <input className="input opacity-80" type="number" value={editing.defectQty}
                  onChange={(e) => setEditing({ ...editing, defectQty: Number(e.target.value) })} />
              </div>
              <div><label className="label">실제 생산수량 (actualProducedQty)</label>
                <input className="input" type="number" min={0}
                  value={editing.actualProducedQty ?? ""}
                  placeholder="예: 100"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setEditing({ ...editing, actualProducedQty: raw === "" ? undefined : Number(raw) });
                  }} />
                <div className="text-[10px] text-ink-500 mt-0.5">
                  실 LOT의 양품 산출 수량. 완료 시 품목 재고는 이 값만큼 증가합니다.
                </div>
              </div>
              <div>
                <label className="label">작업배수 (multiplier)</label>
                <div className="flex items-stretch gap-1">
                  <button type="button"
                    className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel disabled:opacity-50 text-sm font-semibold"
                    disabled={(editing.multiplier ?? 1) <= 0.5}
                    onClick={() => setEditing({ ...editing, multiplier: Math.max(0.5, Number(((editing.multiplier ?? 1) - 0.5).toFixed(2))) })}
                  >−</button>
                  <input className="input text-right tabular-nums flex-1" type="number" min={0.5} step={0.5}
                    value={editing.multiplier ?? 1}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === "" ? 1 : Number(raw);
                      setEditing({ ...editing, multiplier: Number.isFinite(n) && n >= 0.5 ? n : 0.5 });
                    }} />
                  <button type="button"
                    className="px-3 rounded-md border border-border bg-bg-subtle hover:bg-bg-panel text-sm font-semibold"
                    onClick={() => setEditing({ ...editing, multiplier: Number(((editing.multiplier ?? 1) + 0.5).toFixed(2)) })}
                  >+</button>
                </div>
                <div className="text-[10px] text-ink-500 mt-0.5">
                  materialDeduction = (BOM 자재량 × 작업배수) + 조정량. 0.5 단위.
                </div>
              </div>
              <div className="col-span-2"><label className="label">메모</label>
                <textarea className="input min-h-[60px]" value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
            </div>

            {/* ─── 공정 추적 (분산 · 사출 · QC) ─────────────── */}
            <ProcessTrackingPanel
              value={editing}
              equipment={equipment}
              onChange={(patch) => setEditing({ ...editing, ...patch })}
              defaultInjectionDate={editing.date}
            />

            {editing.itemNo && adjustmentRows.length > 0 && (
              <div className="panel">
                <div className="px-4 py-2 border-b border-border bg-bg-subtle/50 text-sm font-medium">
                  실제 원료 투입 조정
                  <span className="ml-2 text-[10px] font-normal text-ink-500">
                    (BOM 자재량 × 작업배수 + 조정량 = 실 투입량 · 차감은 이 값으로만 일어남)
                  </span>
                </div>
                {editing.id && (editing.status === "진행중" || editing.status === "완료") && (
                  <label className="px-4 py-2 border-b border-amber-200 bg-amber-50 text-[12px] flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={applyMaterialEdit}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setApplyMaterialEdit(on);
                        if (on) {
                          // 이미 차감된 양을 불러와 미리보기를 실제 상태와 맞춘다. 차감은
                          // 원료코드 합계 기준이라(같은 원료가 여러 줄이어도 재고는 하나),
                          // 코드별 [기록 합계 − 기준량 합계]를 그 코드의 첫 줄에 싣는다 →
                          // 합계가 정확해 '체크 후 그대로 저장'은 무변동(no-op)이 됨.
                          const rows = execMaterials.filter(
                            (x) => (x.lotId && x.lotId === editing.id) || (x.lotNo && editing.lotCode && x.lotNo === editing.lotCode),
                          );
                          const recordedByCode = new Map<string, number>();
                          for (const x of rows) recordedByCode.set(x.materialCode, (recordedByCode.get(x.materialCode) ?? 0) + (x.actualQty ?? 0));
                          const baseByCode = new Map<string, number>();
                          for (const r of baseRows) baseByCode.set(r.materialCode, (baseByCode.get(r.materialCode) ?? 0) + r.bomPerUnit * multiplier);
                          const adj: Record<string, number> = {};
                          const seenCode = new Set<string>();
                          for (const r of baseRows) {
                            if (seenCode.has(r.materialCode) || !recordedByCode.has(r.materialCode)) { adj[r.rowKey] = 0; continue; }
                            seenCode.add(r.materialCode);
                            adj[r.rowKey] = Number(((recordedByCode.get(r.materialCode) ?? 0) - (baseByCode.get(r.materialCode) ?? 0)).toFixed(6));
                          }
                          setAdjustments(adj);
                        } else {
                          setAdjustments({});
                        }
                      }} />
                    <span className="text-ink-700">
                      <b>실투입량 정정 → 원료재고 반영</b> (이미 진행중/완료된 LOT)<br />
                      체크하면 아래 <b>실 투입량</b>과 이미 차감된 양의 <b>차이만큼만</b> 원료재고가 추가 차감(또는 복원)됩니다.
                      체크하지 않으면 메타데이터만 저장되고 <b>재고는 변하지 않습니다.</b>
                    </span>
                  </label>
                )}
                <table className="w-full text-sm">
                  <thead><tr>
                    <th className="table-th">기준 BOM 자재</th>
                    <th className="table-th text-right">기준량 (BOM × 작업배수)</th>
                    <th className="table-th text-right">조정량 (+/−)</th>
                    <th className="table-th text-right">실 투입량</th>
                    <th className="table-th text-right">현재 재고</th>
                    <th className="table-th text-right">차감 후 재고</th>
                    <th className="table-th text-right">단가</th>
                    <th className="table-th text-right">원료비</th>
                  </tr></thead>
                  <tbody>
                    {actualSummary.rows.map((r) => (
                      <tr key={r.rowKey}>
                        <td className="table-td">
                          <div className="font-medium text-ink-900">{r.materialName}</div>
                          <div className="text-[10px] text-ink-500">{r.materialCode} {r.category ? `· ${r.category}` : ""}</div>
                        </td>
                        <td className="table-td text-right tabular-nums">
                          {formatNumber(r.baseTotalQty)} <span className="text-[10px] text-ink-500">{r.unit}</span>
                        </td>
                        <td className="table-td text-right">
                          <input className="input text-right tabular-nums w-20" type="number" step="0.01"
                            value={adjustments[r.rowKey] ?? 0}
                            onChange={(e) => setAdjustments((prev) => ({
                              ...prev, [r.rowKey]: Number(e.target.value),
                            }))} />
                        </td>
                        <td className={`table-td text-right tabular-nums ${r.actualQty < 0 ? "text-red-700 font-medium" : "font-medium"}`}>
                          {formatNumber(r.actualQty)} <span className="text-[10px] text-ink-500">{r.unit}</span>
                        </td>
                        <td className="table-td text-right tabular-nums text-ink-700">
                          {formatNumber(r.currentStock)} <span className="text-[10px] text-ink-500">{r.stockUnit}</span>
                          {r.unitsCompatible && r.stockUnit !== r.usageUnit && (
                            <div className="text-[10px] text-ink-400">= {formatNumber(r.normalizedAvailable)} {r.usageUnit}</div>
                          )}
                        </td>
                        <td className={`table-td text-right tabular-nums ${!r.unitsCompatible ? "text-red-700" : (r.normalizedRemaining < 0 ? "text-red-700 font-medium" : "")}`}>
                          {r.unitsCompatible
                            ? <>{formatNumber(r.stockAfter)} <span className="text-[10px] text-ink-500">{r.stockUnit}</span></>
                            : <span title={`stock ${r.stockUnit} ≠ usage ${r.usageUnit}`}>단위 불일치</span>}
                          {r.unitsCompatible && r.stockUnit !== r.usageUnit && (
                            <div className="text-[10px] text-ink-400">= {formatNumber(r.normalizedRemaining)} {r.usageUnit}</div>
                          )}
                        </td>
                        <td className="table-td text-right tabular-nums text-ink-700">{formatCurrency(r.unitCost)}</td>
                        <td className="table-td text-right tabular-nums">{formatCurrency(r.materialCost)}</td>
                      </tr>
                    ))}
                    <tr className="bg-bg-subtle">
                      <td className="table-td font-semibold" colSpan={7}>실제 원료 총 원가</td>
                      <td className="table-td text-right tabular-nums font-semibold">{formatCurrency(actualSummary.totalMaterialCost)}</td>
                    </tr>
                    <tr>
                      <td className="table-td text-ink-700 font-medium" colSpan={7}>
                        품목 재고 증가 ({actualProducedQty > 0 ? `+${actualProducedQty.toLocaleString("ko-KR")}` : "—"})
                        · 실제 1개 원가
                      </td>
                      <td className="table-td text-right tabular-nums font-semibold text-base">
                        {actualProducedQty > 0 ? formatCurrency(actualSummary.unitCost) : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {actualSummary.insufficient.length > 0 && (
                  <div className="px-4 py-2 text-[11px] text-red-800 bg-red-50 border-t border-red-200">
                    ⚠ {actualSummary.insufficient.length}종 원료의 차감 후 재고가 음수입니다.
                    원료 재고를 먼저 확보하거나 작업배수/조정량을 다시 검토하세요.
                  </div>
                )}
                <div className="px-4 py-2 text-[10px] text-ink-500 border-t border-border">
                  · 저장 시 위 조정 내역은 <b>품목생산투입원료</b> 시트에 append-only로 기록되며 BOM 마스터는 변경되지 않습니다.
                </div>
              </div>
            )}

            <SaveErrorPanel error={execError} onClose={() => setExecError(null)} />

            {warning && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {warning}
              </div>
            )}

            <div className="text-xs text-ink-500 border-t border-border pt-3">
              · 상태가 <b>진행중</b>/<b>완료</b>가 되면 위 표의 <b>실 투입량</b>만큼 원료가 차감됩니다.<br />
              · 상태가 <b>완료</b>일 때 품목 재고는 <b>실제 생산수량 (actualProducedQty)</b>만큼만 증가합니다.<br />
              · 조정 내역은 <b>품목생산투입원료</b> 시트에 append-only로 기록됩니다. BOM 마스터는 변경되지 않습니다.
            </div>
          </div>
        )}
      </Modal>

      {/* ─── 생산 실행 이력 (by itemNo + date) ─────────────────── */}
      <div className="panel mt-6">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-semibold">
          <HistoryIcon size={14} className="text-ink-500" />
          생산 실행 이력 (실 자재 투입 기록)
          <select className="input ml-auto w-60 text-xs"
            value={historyItemNo} onChange={(e) => setHistoryItemNo(e.target.value)}>
            <option value="">전체 품목</option>
            {items.slice().sort((a, b) => Number(a.itemNo) - Number(b.itemNo)).map((i) => (
              <option key={i.itemNo} value={i.itemNo}>{i.itemNo}번 · {i.colorName}</option>
            ))}
          </select>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>생산일</TH><TH>품목번호</TH><TH>LOT</TH>
              <TH className="text-right">실제 생산수량</TH>
              <TH className="text-right">실 원료 종 수</TH>
              <TH className="text-right">실 원료 총 원가</TH>
              <TH className="text-right">실제 1개 원가</TH>
              <TH>담당자</TH>
            </TR>
          </THead>
          <TBody>
            {(() => {
              const filtered = lots
                .filter((l) => !historyItemNo || l.itemNo === historyItemNo)
                .filter((l) => execMaterials.some((m) => (l.lotCode && m.lotNo === l.lotCode) || (m.lotId && m.lotId === l.id)))
                .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
              if (filtered.length === 0) {
                return <Empty>실 자재 투입 기록이 있는 LOT이 없습니다.</Empty>;
              }
              return filtered.map((l) => {
                const rows = execMaterials.filter((m) => (l.lotCode && m.lotNo === l.lotCode) || (m.lotId && m.lotId === l.id));
                const totalMaterialCost = rows.reduce((s, r) => {
                  const mat = materials.find((m) =>
                    m.id === r.materialCode || m.materialCode === r.materialCode);
                  const uc = mat?.unitCost ?? mat?.unitPrice ?? 0;
                  return s + r.actualQty * uc;
                }, 0);
                const qty = l.actualProducedQty ?? 0;
                const unit = qty > 0 ? totalMaterialCost / qty : 0;
                return (
                  <TR key={l.id}>
                    <TD>{formatDateKst(l.date)}</TD>
                    <TD className="font-mono">{l.itemNo}</TD>
                    <TD className="font-mono text-xs text-ink-700">{l.lotCode}</TD>
                    <TD className="text-right tabular-nums">{qty > 0 ? formatNumber(qty) : <span className="text-ink-400">—</span>}</TD>
                    <TD className="text-right tabular-nums">{rows.length}</TD>
                    <TD className="text-right tabular-nums">{formatCurrency(totalMaterialCost)}</TD>
                    <TD className="text-right tabular-nums font-semibold">{qty > 0 ? formatCurrency(unit) : "—"}</TD>
                    <TD>{l.assignee}</TD>
                  </TR>
                );
              });
            })()}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

// ─── ProcessTrackingPanel ─────────────────────────────────
// Compact 3-column layout: 분산 / 사출 / QC. Each step has a date + worker.
// Pure presentational — all updates funnel through the `onChange` patch.
// `defaultInjectionDate` lets the inline form suggest the production date for
// 사출일 when the user clicks the small "생산일과 동일" shortcut.
function ProcessTrackingPanel({
  value, onChange, defaultInjectionDate, equipment = [],
}: {
  value: Pick<ItemLot,
    "mixingDate" | "mixingWorker" | "mixingMachine"
    | "dispersionDate" | "dispersionWorker" | "dispersionMachine"
    | "injectionDate" | "injectionWorker" | "injectionMachine"
    | "qcDate" | "qcWorker" | "qcEquipment">;
  onChange: (patch: Partial<ItemLot>) => void;
  defaultInjectionDate?: string;
  equipment?: Equipment[];
}) {
  // Active 설비마스터 names per process type. Datalist suggestions for each
  // step are: registered active equipment first, then the canned presets so
  // legacy values still appear. Free text is always still allowed.
  const equipByProcess = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of equipment) {
      if (e.status !== "활성") continue;
      const arr = map.get(e.processType) ?? [];
      if (!arr.includes(e.equipmentName)) arr.push(e.equipmentName);
      map.set(e.processType, arr);
    }
    return map;
  }, [equipment]);

  const productionWorkers = getProductionWorkers();
  const qcWorkers = getQcWorkers();
  const steps = [
    {
      key: "배합", processKey: "배합", dateKey: "mixingDate" as const,
      workerKey: "mixingWorker" as const, machineKey: "mixingMachine" as const,
      machineLabel: "배합 설비", workerOptions: productionWorkers,
      tone: "bg-violet-50 text-violet-800 border-violet-200",
    },
    {
      key: "분산", processKey: "분산", dateKey: "dispersionDate" as const,
      workerKey: "dispersionWorker" as const, machineKey: "dispersionMachine" as const,
      machineLabel: "분산 설비", workerOptions: productionWorkers,
      tone: "bg-sky-50 text-sky-800 border-sky-200",
    },
    {
      key: "사출", processKey: "사출", dateKey: "injectionDate" as const,
      workerKey: "injectionWorker" as const, machineKey: "injectionMachine" as const,
      machineLabel: "사출 설비", workerOptions: productionWorkers,
      tone: "bg-amber-50 text-amber-800 border-amber-200",
    },
    {
      key: "QC", processKey: "QC", dateKey: "qcDate" as const,
      workerKey: "qcWorker" as const, machineKey: "qcEquipment" as const,
      machineLabel: "QC 장비", workerOptions: qcWorkers,
      tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
  ];
  return (
    <div className="rounded-md border border-border bg-bg-subtle/40 p-3">
      <div className="text-xs font-semibold text-ink-800 mb-2">공정 추적 <span className="text-[10px] text-ink-500 font-normal">— 배합 · 분산 · 사출 · QC (선택 입력 · 재고/원가에는 영향 없음)</span></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {steps.map((s) => {
          const listId = `equip-${s.machineKey}`;
          // Dropdown options come ONLY from 설비마스터 — never from
          // EQUIPMENT_PRESETS, and never merged with values that may be
          // sitting on existing LOT rows. If the current value isn't a
          // registered equipment, it still shows in the input as plain text
          // (the user can keep it or pick a registered one).
          const options = equipByProcess.get(s.processKey) ?? [];
          return (
            <div key={s.key} className="rounded border border-border bg-bg-panel p-2">
              <div className="flex items-center gap-1 mb-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${s.tone}`}>{s.key}</span>
                {s.key === "사출" && defaultInjectionDate && !value[s.dateKey] && (
                  <button type="button"
                    className="ml-auto text-[10px] text-beige-700 hover:underline"
                    onClick={() => onChange({ [s.dateKey]: defaultInjectionDate } as Partial<ItemLot>)}
                    title="생산일과 동일하게 자동 입력"
                  >생산일과 동일</button>
                )}
              </div>
              <div className="space-y-1">
                <input className="input" type="date"
                  value={(value[s.dateKey] ?? "")}
                  onChange={(e) => onChange({ [s.dateKey]: e.target.value } as Partial<ItemLot>)} />
                {/* Worker is a strict select — free-text removed to prevent
                    typos. Legacy values that aren't in the team list show
                    up as a "(기존)" option so existing rows keep displaying. */}
                {(() => {
                  const currentWorker = (value[s.workerKey] ?? "").trim();
                  const knownWorker = currentWorker && s.workerOptions.includes(currentWorker);
                  return (
                    <select className="input"
                      value={currentWorker}
                      onChange={(e) => onChange({ [s.workerKey]: e.target.value } as Partial<ItemLot>)}>
                      <option value="">— {s.key} 담당자 —</option>
                      {s.workerOptions.map((w) => <option key={w} value={w}>{w}</option>)}
                      {currentWorker && !knownWorker && (
                        <option value={currentWorker}>{currentWorker} (기존)</option>
                      )}
                    </select>
                  );
                })()}
                <input className="input" placeholder={s.machineLabel} list={listId}
                  value={(value[s.machineKey] ?? "")}
                  onChange={(e) => onChange({ [s.machineKey]: e.target.value } as Partial<ItemLot>)} />
                <datalist id={listId}>
                  {options.map((opt) => <option key={opt} value={opt} />)}
                </datalist>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ShortageDebugPanel ────────────────────────────────────
// Per-row breakdown shown only when there's at least one shortage or
// unit-incompatibility, so we can answer "why was this material flagged?"
// at a glance — without polluting the normal happy-path table.
type ShortageRow = {
  materialName: string;
  category?: string;
  currentStock: number;
  stockUnit: string;
  actualQty: number;
  usageUnit: string;
  normalizedAvailable: number;
  normalizedRemaining: number;
  unitsCompatible: boolean;
};
function ShortageDebugPanel({
  insufficient, incompatible,
}: { insufficient: ShortageRow[]; incompatible: ShortageRow[] }) {
  if (insufficient.length === 0 && incompatible.length === 0) return null;
  return (
    <div className="border-t border-red-200 bg-red-50/40">
      {incompatible.length > 0 && (
        <div className="px-3 py-2 text-[11px] text-red-900">
          <div className="font-semibold mb-1">단위가 달라 차감할 수 없습니다. 원료재고와 BOM 단위를 맞춰주세요. ({incompatible.length}종)</div>
          <table className="w-full text-[11px] font-mono">
            <thead className="text-red-700/70">
              <tr>
                <th className="text-left py-0.5 pr-2">materialName</th>
                <th className="text-left py-0.5 pr-2">category</th>
                <th className="text-left py-0.5 pr-2">rawStockUnit</th>
                <th className="text-left py-0.5 pr-2">rawUsageUnit</th>
                <th className="text-left py-0.5 pr-2">normStockUnit</th>
                <th className="text-left py-0.5">normUsageUnit</th>
              </tr>
            </thead>
            <tbody>
              {incompatible.map((r, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">{r.materialName}</td>
                  <td className="py-0.5 pr-2">{r.category || "—"}</td>
                  <td className="py-0.5 pr-2">{r.stockUnit || "—"}</td>
                  <td className="py-0.5 pr-2">{r.usageUnit || "—"}</td>
                  <td className="py-0.5 pr-2">{normalizeUnit(r.stockUnit) || "—"}</td>
                  <td className="py-0.5">{normalizeUnit(r.usageUnit) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {insufficient.length > 0 && (
        <div className="px-3 py-2 text-[11px] text-red-900 border-t border-red-200">
          <div className="font-semibold mb-1">[debug] 차감 후 재고 음수 — {insufficient.length}종</div>
          <table className="w-full text-[11px] font-mono">
            <thead className="text-red-700/70">
              <tr>
                <th className="text-left py-0.5 pr-2">materialName</th>
                <th className="text-right py-0.5 pr-2">stock</th>
                <th className="text-left py-0.5 pr-2">stockUnit</th>
                <th className="text-right py-0.5 pr-2">usageQty</th>
                <th className="text-left py-0.5 pr-2">usageUnit</th>
                <th className="text-right py-0.5 pr-2">norm avail</th>
                <th className="text-right py-0.5">norm remaining</th>
              </tr>
            </thead>
            <tbody>
              {insufficient.map((r, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">{r.materialName}</td>
                  <td className="py-0.5 pr-2 text-right">{r.currentStock}</td>
                  <td className="py-0.5 pr-2">{r.stockUnit}</td>
                  <td className="py-0.5 pr-2 text-right">{r.actualQty}</td>
                  <td className="py-0.5 pr-2">{r.usageUnit}</td>
                  <td className="py-0.5 pr-2 text-right">{r.normalizedAvailable}</td>
                  <td className="py-0.5 text-right font-semibold">{r.normalizedRemaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── ProcessBadges ─────────────────────────────────────────
// LOT-list compact summary of process status. Renders only the steps that
// have data; never shows clutter for unused steps.
function ProcessBadges({ lot }: { lot: ItemLot }) {
  // ─── Fallback resolution (read-only) ──────────────────────
  // Per spec: when a per-step worker is missing, fall back to lot.assignee
  // (which fromRow already normalizes from legacy r.worker/r.assignee).
  // When a per-step date is missing, fall back to lot.date (which fromRow
  // normalizes from r.date/r.productionDate). Equipment has no fallback —
  // we just omit it from the chip when empty.
  const wf = (lot.assignee ?? "").trim();
  const df = (lot.date ?? "").trim();
  const rows: Array<{ key: string; date?: string; worker?: string; machine?: string; tone: string }> = [
    { key: "배합", date: lot.mixingDate     || df, worker: lot.mixingWorker     || wf, machine: lot.mixingMachine,     tone: "bg-violet-50 text-violet-800 border-violet-200" },
    { key: "분산", date: lot.dispersionDate || df, worker: lot.dispersionWorker || wf, machine: lot.dispersionMachine, tone: "bg-sky-50 text-sky-800 border-sky-200" },
    { key: "사출", date: lot.injectionDate  || df, worker: lot.injectionWorker  || wf, machine: lot.injectionMachine,  tone: "bg-amber-50 text-amber-800 border-amber-200" },
    { key: "QC",   date: lot.qcDate         || df, worker: lot.qcWorker         || wf, machine: lot.qcEquipment,        tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  ];
  // A chip renders if THE STEP-LEVEL value is set (any of date/worker/machine).
  // Pure fallbacks alone aren't enough to surface a chip — that would
  // make every LOT show all 4 chips identically.
  // A chip surfaces only when the user actually engaged with the step —
  // i.e. set a date OR picked equipment. The default-worker auto-fill on new
  // LOTs would otherwise force every step's chip to render even on empty
  // LOTs. (Worker is still shown inside the chip when present.)
  const hasStepData = (key: string) => {
    switch (key) {
      case "배합": return !!(lot.mixingDate || lot.mixingMachine);
      case "분산": return !!(lot.dispersionDate || lot.dispersionMachine);
      case "사출": return !!(lot.injectionDate || lot.injectionMachine);
      case "QC":   return !!(lot.qcDate || lot.qcEquipment);
      default: return false;
    }
  };
  const filled = rows.filter((r) => hasStepData(r.key));
  if (filled.length === 0) return <span className="text-ink-400 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-0.5 max-w-[220px]">
      {filled.map((r) => {
        // Compact 2-line layout.
        //   line 1 = `[배합] · 김연수`
        //   line 2 = `05-29` (date, MM-DD, no clock component possible)
        // Equipment is in the tooltip only — it's the most likely string
        // to blow out the column width.
        const shortDate = r.date ? formatDateKst(r.date).slice(5) : "";
        const fullDate  = r.date ? formatDateKst(r.date) : "(날짜 없음)";
        const tooltip = [
          `${r.key}`,
          `작업자: ${r.worker || "(없음)"}`,
          `일자: ${fullDate}`,
          `설비: ${r.machine || "(없음)"}`,
        ].join("\n");
        return (
          <span key={r.key} className={`inline-flex flex-col text-[10px] leading-tight px-1.5 py-0.5 rounded border ${r.tone} max-w-full overflow-hidden`}
            title={tooltip}>
            <span className="truncate"><b>{r.key}</b>{r.worker ? <> · {r.worker}</> : null}</span>
            {shortDate && <span className="text-ink-600 truncate font-mono">{shortDate}</span>}
          </span>
        );
      })}
    </div>
  );
}
