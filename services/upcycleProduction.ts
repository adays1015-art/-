import type { ItemLot, LotStatus, ProductType } from "@/types";
import {
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId, todayISO, generateLotCode } from "@/lib/utils";
import { consumeMaterials } from "./upcycleMaterials";
import { addItemStock, getItemByNo } from "./upcycleItems";
import { logWork } from "./history";
import { convertQty, normalizeUnit } from "@/lib/units";

const TAB = SHEET_TABS.upcycleLots;

// ─── Canonical 품목생산LOT schema ─────────────────────────────
// Strict header-mapped writes only. Each field has exactly one column.
// Reads accept legacy aliases (lotNo / worker / productionDate) for
// back-compat but writes go to the canonical names only.
export const ITEM_LOT_HEADER = [
  "id", "date", "itemNo", "productType", "lotCode",
  "targetQty", "completedQty", "defectQty", "assignee", "status", "note",
  "actualProducedQty", "multiplier", "actualMaterialTotalCost", "actualUnitCost",
  // 업사이클 선행 공정 (입고확인 / 추출 / 정제 / 숙성). All optional, metadata-only.
  "intakeDate", "intakeWorker",
  "extractionDate", "extractionWorker",
  "refiningDate", "refiningWorker",
  "agingDate", "agingWorker",
  // Process tracking columns (배합 / 분산 / 사출 / QC). All optional, metadata-only.
  "mixingDate", "mixingWorker",
  "dispersionDate", "dispersionWorker",
  "injectionDate", "injectionWorker",
  "qcDate", "qcWorker",
  // Equipment columns (배합 / 분산 / 사출 설비 / QC 장비). All optional, metadata-only.
  "mixingMachine", "dispersionMachine", "injectionMachine", "qcEquipment",
  // Disposal (폐기 처리). All optional. Strict writer will warn when the
  // sheet hasn't yet been extended with these columns.
  "disposalDate", "disposalQty", "disposalReason", "disposalWorker",
] as const;

function toRow(l: ItemLot): (string | number | boolean)[] {
  return [
    l.id, l.date, l.itemNo, l.productType, l.lotCode,
    l.targetQty, l.completedQty, l.defectQty, l.assignee, l.status, l.note,
    l.actualProducedQty ?? "", l.multiplier ?? "",
    l.actualMaterialTotalCost ?? "", l.actualUnitCost ?? "",
    l.intakeDate ?? "", l.intakeWorker ?? "",
    l.extractionDate ?? "", l.extractionWorker ?? "",
    l.refiningDate ?? "", l.refiningWorker ?? "",
    l.agingDate ?? "", l.agingWorker ?? "",
    l.mixingDate ?? "", l.mixingWorker ?? "",
    l.dispersionDate ?? "", l.dispersionWorker ?? "",
    l.injectionDate ?? "", l.injectionWorker ?? "",
    l.qcDate ?? "", l.qcWorker ?? "",
    l.mixingMachine ?? "", l.dispersionMachine ?? "",
    l.injectionMachine ?? "", l.qcEquipment ?? "",
    l.disposalDate ?? "", l.disposalQty ?? "",
    l.disposalReason ?? "", l.disposalWorker ?? "",
  ];
}

/**
 * Parse an optional numeric cell. Distinguishes "no value" from "literal 0":
 *   - undefined / null / "" → undefined
 *   - any finite Number(str) → that number (including 0)
 *   - non-numeric junk → undefined
 *
 * The previous implementation used `Number(s) || 0` which silently coerced
 * any unparseable input into 0, then the UI render rejected 0 as "no value"
 * — combination produced "—" for legitimate values too.
 */
function parseOptionalNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function fromRow(r: Record<string, string>): ItemLot {
  return {
    id: r.id ?? "",
    // Accept either the legacy column name or the user-spec alias.
    date: r.date ?? r.productionDate ?? "",
    itemNo: r.itemNo ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    lotCode: r.lotCode ?? r.lotNo ?? "",
    targetQty: Number(r.targetQty) || 0,
    completedQty: Number(r.completedQty) || 0,
    defectQty: Number(r.defectQty) || 0,
    assignee: r.assignee ?? r.worker ?? "",
    status: (r.status as LotStatus) ?? "예정",
    note: r.note ?? "",
    // Exact field names per the strict header schema. Legacy
    // actualProductionQty is also accepted on read for back-compat.
    actualProducedQty: parseOptionalNumber(r.actualProducedQty ?? r.actualProductionQty),
    multiplier: parseOptionalNumber(r.multiplier),
    actualMaterialTotalCost: parseOptionalNumber(r.actualMaterialTotalCost),
    actualUnitCost: parseOptionalNumber(r.actualUnitCost),
    intakeDate: r.intakeDate ?? "",
    intakeWorker: r.intakeWorker ?? "",
    extractionDate: r.extractionDate ?? "",
    extractionWorker: r.extractionWorker ?? "",
    refiningDate: r.refiningDate ?? "",
    refiningWorker: r.refiningWorker ?? "",
    agingDate: r.agingDate ?? "",
    agingWorker: r.agingWorker ?? "",
    mixingDate: r.mixingDate ?? "",
    mixingWorker: r.mixingWorker ?? "",
    dispersionDate: r.dispersionDate ?? "",
    dispersionWorker: r.dispersionWorker ?? "",
    injectionDate: r.injectionDate ?? "",
    injectionWorker: r.injectionWorker ?? "",
    // Accept legacy "qDate" column as a fallback for read.
    qcDate: r.qcDate ?? r.qDate ?? "",
    qcWorker: r.qcWorker ?? "",
    mixingMachine: r.mixingMachine ?? "",
    dispersionMachine: r.dispersionMachine ?? "",
    injectionMachine: r.injectionMachine ?? "",
    qcEquipment: r.qcEquipment ?? "",
    disposalDate: r.disposalDate ?? "",
    disposalQty: parseOptionalNumber(r.disposalQty),
    disposalReason: r.disposalReason ?? "",
    disposalWorker: r.disposalWorker ?? "",
  };
}

// Canonical LOT code generation lives in lib/utils.generateLotCode (pure,
// client-safe). Existing LOTs with the legacy format are never rewritten.

export async function listItemLots(): Promise<ItemLot[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().upcycleLots;
}

export async function listItemLotsByItem(itemNo: string): Promise<ItemLot[]> {
  return (await listItemLots()).filter((l) => l.itemNo === itemNo);
}

/**
 * Material deduction for a LOT.
 *
 * Per the spec, BOM × targetQty (or productionUnit, or a fixed 100) MUST NOT
 * be used. Callers pass an explicit `actualMaterials` list with the
 * per-material `actualQty` that was actually consumed. If no list is provided
 * we skip deduction and return a warning — the caller decides whether to
 * proceed (e.g., for "예정" status the LOT row may exist without consumption).
 */
async function consumeFromExplicit(
  lot: ItemLot,
  actualMaterials: Array<{ materialCode: string; materialName?: string; actualQty: number; unit?: string }>,
): Promise<string | undefined> {
  // ─── [DEBUG] deduction pipeline trace ────────────────────
  console.log("[deduct] consumeFromExplicit start", {
    lotCode: lot.lotCode,
    itemNo: lot.itemNo,
    actualMaterialsCount: actualMaterials.length,
    firstActualMaterial: actualMaterials[0] ?? null,
  });
  if (actualMaterials.length === 0) {
    console.log("[deduct] SKIP — actualMaterials empty");
    return "실제 원료 투입 목록이 비어 있어 원료 차감을 건너뜁니다.";
  }
  const { listMaterials } = await import("./upcycleMaterials");
  const mats = await listMaterials();
  // 업사이클 BOM은 기존 원료재고도 구성품으로 가질 수 있으므로, 업사이클
  // 원료에서 못 찾은 코드는 기존 원료재고에서도 찾아 차감한다.
  const { listMaterials: listMainMaterials } = await import("./materials");
  const mainMats = await listMainMaterials();

  // ─── Two distinct failure modes, tracked separately ───────
  // 1) "Unresolved" — the BOM-stored materialCode has no matching row in
  //    원료재고 (neither by id nor by materialCode). We CANNOT deduct from
  //    an unknown material; we exclude it from `uses` and warn the user
  //    with the exact code so they can fix the BOM mapping. Previously
  //    these fell through to consumeMaterials as `materialId = code`,
  //    which couldn't find them by id and tripped the ALL-OR-NOTHING
  //    failure path — blocking deduction of the OTHER resolved materials.
  // 2) "Insufficient" — material resolves but stock < amount. The
  //    underlying consumeMaterials still requires ALL resolved entries
  //    to have sufficient stock; if any is short, none deduct.
  const unresolvedCodes: string[] = [];
  const incompatibleUnits: string[] = [];
  // resolvedUses.amount is in the MATERIAL'S STORAGE UNIT (post-conversion),
  // so consumeMaterials' stock comparison stays meaningful regardless of
  // whether BOM/usage units differ from purchase units.
  const resolvedUses: { materialId: string; amount: number; code: string; name: string; fromUnit: string; toUnit: string; inv: "업사이클" | "기존" }[] = [];
  for (const m of actualMaterials) {
    const code = String(m.materialCode || "").trim();
    if (!code) continue;
    if (m.actualQty === 0) continue;
    // 업사이클 원료 우선, 없으면 기존 원료재고에서 찾는다.
    let inv: "업사이클" | "기존" = "업사이클";
    let found = mats.find((x) => x.id === code || x.materialCode === code);
    if (!found) {
      found = mainMats.find((x) => x.id === code || x.materialCode === code);
      if (found) inv = "기존";
    }
    if (!found) {
      unresolvedCodes.push(code);
      continue;
    }
    // Convert actualQty (usage unit, e.g. "g") into material's stock unit
    // (e.g. "kg") so consumeMaterials' stock comparison and writeback both
    // operate in the same unit as material.stock. Pure-numeric — does NOT
    // alter the persisted unit on either side.
    const usageUnit = String(m.unit || "").trim() || found.unit || "";
    const stockUnit = found.unit || "";
    const conv = convertQty(m.actualQty, usageUnit, stockUnit);
    if (!conv.compatible) {
      // Per policy: g ↔ ml is NEVER auto-converted. Show a clear warning
      // including category so the user knows which side to fix.
      const rawS = stockUnit || "—";
      const rawU = usageUnit || "—";
      const normS = normalizeUnit(stockUnit) || "—";
      const normU = normalizeUnit(usageUnit) || "—";
      const name = found.materialName || found.name || code;
      incompatibleUnits.push(
        `${name} [${found.category}] (재고 ${rawS} → ${normS} vs 사용 ${rawU} → ${normU})`,
      );
      continue;
    }
    resolvedUses.push({
      materialId: found.id,
      amount: conv.qty,
      code,
      name: found.materialName || found.name || code,
      fromUnit: usageUnit,
      toUnit: stockUnit,
      inv,
    });
  }
  console.log("[deduct] resolution", {
    resolvedCount: resolvedUses.length,
    unresolvedCount: unresolvedCodes.length,
    incompatibleCount: incompatibleUnits.length,
    unresolvedCodes,
    incompatibleUnits,
    resolvedUses,
  });

  if (resolvedUses.length === 0) {
    const parts: string[] = [];
    if (unresolvedCodes.length > 0) parts.push(`원료재고에서 materialCode를 찾지 못했습니다: ${unresolvedCodes.join(", ")}`);
    if (incompatibleUnits.length > 0) parts.push(`단위가 달라 차감할 수 없습니다. 원료재고와 BOM 단위를 맞춰주세요: ${incompatibleUnits.join(", ")}`);
    const note = parts.length ? parts.join(" · ") : "실 투입량이 모두 0이라 원료 차감을 건너뜁니다.";
    console.log("[deduct] SKIP — no resolved materials", note);
    await logWork({
      type: "원료 차감",
      target: `${lot.lotCode} / ${lot.itemNo}번`,
      change: `차감 0건 / 미해결 ${unresolvedCodes.length}건 / 단위불일치 ${incompatibleUnits.length}건`,
      assignee: lot.assignee,
      note,
    });
    return note;
  }

  // 업사이클 원료재고 / 기존 원료재고를 각각의 consumeMaterials 로 차감.
  const upcycleUses = resolvedUses.filter((u) => u.inv === "업사이클");
  const mainUses = resolvedUses.filter((u) => u.inv === "기존");
  console.log("[deduct] calling consumeMaterials", {
    upcycle: upcycleUses.map(({ materialId, amount }) => ({ materialId, amount })),
    main: mainUses.map(({ materialId, amount }) => ({ materialId, amount })),
  });
  const { consumeMaterials: consumeMainMaterials } = await import("./materials");
  const [upcycleResult, mainResult] = await Promise.all([
    consumeMaterials(upcycleUses.map(({ materialId, amount }) => ({ materialId, amount }))),
    consumeMainMaterials(mainUses.map(({ materialId, amount }) => ({ materialId, amount }))),
  ]);
  const result = {
    ok: upcycleResult.ok && mainResult.ok,
    missing: [...upcycleResult.missing, ...mainResult.missing],
  };
  console.log("[deduct] consumeMaterials result", { upcycleResult, mainResult, result });

  // Compose a single warning that distinguishes the failure modes.
  const parts: string[] = [];
  if (unresolvedCodes.length > 0) {
    parts.push(`원료재고에서 materialCode를 찾지 못했습니다: ${unresolvedCodes.join(", ")}`);
  }
  if (incompatibleUnits.length > 0) {
    parts.push(
      `단위가 달라 차감할 수 없습니다. 원료재고와 BOM 단위를 맞춰주세요: ${incompatibleUnits.join(", ")}`,
    );
  }
  if (!result.ok) {
    // result.missing contains *materialIds*. Map back to materialCodes
    // (which the user actually sees in BOM) for a friendlier message.
    const missingCodes = result.missing.map((id) => {
      const r = resolvedUses.find((u) => u.materialId === id);
      const mat = mats.find((x) => x.id === id) || mainMats.find((x) => x.id === id);
      return r?.code || mat?.materialCode || id;
    });
    parts.push(`원료 재고 부족 — ${missingCodes.join(", ")} (LOT은 생성됨, 차감 안 됨)`);
  }

  await logWork({
    type: "원료 차감",
    target: `${lot.lotCode} / ${lot.itemNo}번`,
    change: `차감 시도 ${resolvedUses.length}건${unresolvedCodes.length ? ` / 미해결 ${unresolvedCodes.length}건` : ""}`,
    assignee: lot.assignee,
    note: parts.length ? parts.join(" · ") : "정상 차감",
  });

  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * Reconcile raw-material deduction when an ALREADY 진행중/완료 LOT is edited
 * with new actual-input amounts (e.g. "생산 중 몇 그람 더 들어감").
 *
 * Deducts / restocks ONLY the delta versus what was already recorded in
 * 품목생산투입원료, so editing an in-flight LOT never double-deducts. The delta
 * is applied through consumeFromExplicit (unit conversion, all-or-nothing, and
 * negative amounts = restock all reused). A delta row is appended to
 * 품목생산투입원료 so the running total — and the next edit's baseline — stay
 * correct, and cost math keeps summing to the true actual usage.
 *
 * SAFETY: if the LOT has NO existing 투입원료 rows we cannot know what was
 * already deducted at creation, so we SKIP and warn rather than risk a double
 * deduction (e.g. legacy LOTs created before this audit trail existed).
 */
async function reconcileMaterials(
  lot: ItemLot,
  newMaterials: Array<{ materialCode: string; materialName?: string; actualQty: number; unit?: string }>,
): Promise<string | undefined> {
  if (newMaterials.length === 0) return undefined;
  const { listExecutionMaterials, appendExecutionMaterials } = await import("./upcycleProductionExecution");
  // Same lot-matching predicate used by delete/hasExec — by lotId OR lotCode.
  const allExecs = (await listExecutionMaterials()).filter(
    (e) => (e.lotId && e.lotId === lot.id) || (e.lotNo && lot.lotCode && e.lotNo === lot.lotCode),
  );
  if (allExecs.length === 0) {
    return "기존 투입원료 기록이 없어 재차감을 건너뜁니다 (이중 차감 방지). " +
      "수량 정정이 필요하면 해당 LOT을 폐기 후 재생성하세요.";
  }
  // Previously-deducted running total per materialCode (usage unit — the same
  // unit the new actualMaterials use; consumeFromExplicit converts to stock
  // unit internally).
  const prevByCode = new Map<string, number>();
  for (const e of allExecs) {
    const code = String(e.materialCode || "").trim();
    if (!code) continue;
    prevByCode.set(code, (prevByCode.get(code) ?? 0) + (e.actualQty || 0));
  }
  // Aggregate the restated amounts by code first. The same material can sit on
  // several BOM lines (e.g. 배합 + 사출) but 원료재고 is a single per-material
  // balance, so reconcile TOTALS — otherwise each line would subtract the full
  // previous sum and over/under-deduct.
  const newByCode = new Map<string, { total: number; unit?: string; name?: string }>();
  for (const m of newMaterials) {
    const code = String(m.materialCode || "").trim();
    if (!code) continue;
    const cur = newByCode.get(code);
    if (cur) cur.total += m.actualQty;
    else newByCode.set(code, { total: m.actualQty, unit: m.unit, name: m.materialName });
  }
  // Delta per material = restated total − already deducted total.
  const deltas = Array.from(newByCode.entries())
    .map(([code, v]) => ({
      materialCode: code,
      materialName: v.name,
      actualQty: v.total - (prevByCode.get(code) ?? 0),
      unit: v.unit,
    }))
    .filter((d) => Math.abs(d.actualQty) > 1e-9);
  if (deltas.length === 0) return "투입량 변경 없음 — 재고 변동 없습니다.";

  // Apply ONLY the delta. consumeFromExplicit deducts positive deltas and
  // restocks negative ones (consumeMaterials treats a negative amount as a
  // stock increase), with the usual unit conversion + all-or-nothing guard.
  const warning = await consumeFromExplicit(lot, deltas);

  // Append delta rows so the running total stays accurate for cost math and
  // for the next edit's baseline. unitCost is pulled from 원료재고.
  const { listMaterials } = await import("./upcycleMaterials");
  const mats = await listMaterials();
  // 기존 원료재고도 BOM 구성품일 수 있으므로 단가 조회 시 함께 검색.
  const { listMaterials: listMainMaterials } = await import("./materials");
  const mainMats = await listMainMaterials();
  await appendExecutionMaterials(
    deltas.map((d) => {
      const found = mats.find((x) => x.id === d.materialCode || x.materialCode === d.materialCode)
        || mainMats.find((x) => x.id === d.materialCode || x.materialCode === d.materialCode);
      const unitCost = found?.unitCost ?? found?.unitPrice ?? 0;
      return {
        lotId: lot.id,
        lotNo: lot.lotCode,
        itemNo: lot.itemNo,
        materialCode: d.materialCode,
        materialName: d.materialName ?? found?.materialName ?? found?.name ?? d.materialCode,
        baseQty: 0,
        multiplier: 1,
        baseTotalQty: 0,
        adjustmentQty: d.actualQty,
        actualQty: d.actualQty,
        unit: d.unit ?? found?.unit ?? "",
        unitCost,
        materialCost: d.actualQty * unitCost,
        note: "편집 차액 반영",
      };
    }),
  );
  return warning;
}

export async function createItemLot(
  input: Omit<ItemLot, "id" | "lotCode" | "completedQty" | "defectQty" | "productType"> & {
    completedQty?: number;
    defectQty?: number;
    lotCode?: string;
    productType?: ProductType;
    actualMaterials?: Array<{ materialCode: string; materialName?: string; actualQty: number }>;
    actualMaterialTotalCost?: number;
    actualUnitCost?: number;
  },
): Promise<{ lot: ItemLot; warning?: string }> {
  const item = await getItemByNo(input.itemNo);
  const lot: ItemLot = {
    id: genId("IL"),
    date: input.date,
    itemNo: input.itemNo,
    productType: input.productType ?? item?.productType ?? "오일파스텔",
    // Canonical format LOT-{itemNo}-{YYYYMMDD}-{seq2}.
    // Order of precedence:
    //   1) client-supplied lotCode (manual override or precomputed preview)
    //   2) freshly computed canonical code
    // We re-list the existing lots on the server so the sequence is always
    // correct even if the client's cached list is one save behind. The old
    // `LOT-{YYMMDD}-{itemNo}-{random}` format is no longer produced anywhere.
    lotCode: (input.lotCode && input.lotCode.trim())
      || generateLotCode(input.itemNo, input.date, await listItemLots(), "UC"),
    targetQty: input.targetQty,
    completedQty: input.completedQty ?? 0,
    defectQty: input.defectQty ?? 0,
    assignee: input.assignee,
    status: input.status,
    note: input.note,
    actualProducedQty: input.actualProducedQty,
    multiplier: input.multiplier,
    actualMaterialTotalCost: input.actualMaterialTotalCost,
    actualUnitCost: input.actualUnitCost,
    mixingDate: input.mixingDate,
    mixingWorker: input.mixingWorker,
    dispersionDate: input.dispersionDate,
    dispersionWorker: input.dispersionWorker,
    injectionDate: input.injectionDate,
    injectionWorker: input.injectionWorker,
    qcDate: input.qcDate,
    qcWorker: input.qcWorker,
    mixingMachine: input.mixingMachine,
    dispersionMachine: input.dispersionMachine,
    injectionMachine: input.injectionMachine,
    qcEquipment: input.qcEquipment,
  };

  console.log("[deduct] createItemLot received", {
    itemNo: input.itemNo,
    actualMaterialsCount: (input.actualMaterials ?? []).length,
    actualProducedQty: input.actualProducedQty,
    status: input.status,
  });
  let warning: string | undefined;
  // ─── 테스트 status — no stock movement ──────────────────
  // Trial / experimental LOTs record an audit row but MUST NOT deduct raw
  // material or add to product stock. This is the only place createItemLot
  // short-circuits both side effects.
  const isTest = input.status === "테스트";
  // Per the latest spec, on save we ALWAYS:
  //   (a) deduct 원료재고.stock by actualQty for each provided material
  //   (b) increase 품목마스터.stock by actualProducedQty
  // …regardless of status, EXCEPT for 테스트 LOTs.
  if (!isTest && (input.actualMaterials ?? []).length > 0) {
    warning = await consumeFromExplicit(lot, input.actualMaterials ?? []);
  } else if (isTest) {
    warning = "테스트 상태이므로 원료 차감 및 품목재고 증가를 건너뜁니다.";
  }

  if ((await useSheets())) await strictAppendRow(TAB, toRow(lot), [...ITEM_LOT_HEADER]);
  else getStore().upcycleLots.unshift(lot);

  await logWork({
    type: "품목 생산",
    target: `${lot.lotCode} / ${lot.itemNo}번`,
    change: `실 생산수량 ${lot.actualProducedQty ?? "?"}${item?.unit ?? "개"} · 작업배수 ${lot.multiplier ?? "?"} · 상태 ${lot.status}`,
    assignee: lot.assignee,
    note: lot.note,
  });

  // Inventory increase is STRICTLY actualProducedQty. targetQty is never used.
  // 테스트 status skips the inventory increase (no stock movement at all).
  const stockQty = lot.actualProducedQty ?? 0;
  if (!isTest && stockQty > 0) {
    await addItemStock(lot.itemNo, stockQty);
    await logWork({
      type: "품목 입고",
      target: `${lot.itemNo}번 ${item?.colorName ?? ""}`,
      change: `+${stockQty}${item?.unit ?? "개"} (actualProducedQty)`,
      assignee: lot.assignee,
      note: `LOT ${lot.lotCode}`,
    });
  } else if (!isTest) {
    warning = (warning ? warning + " · " : "") + "actualProducedQty가 0이라 품목 재고는 증가하지 않았습니다.";
  }

  return { lot, warning };
}

export async function updateItemLot(
  id: string,
  patch: Partial<ItemLot> & {
    actualMaterials?: Array<{ materialCode: string; materialName?: string; actualQty: number; unit?: string }>;
    // Explicit opt-in. Only when TRUE does an edit to an already-진행중/완료 LOT
    // reconcile 원료재고 against the restated 실투입량. Left false/undefined for
    // metadata-only edits (date, 공정, 메모 …) so they NEVER move stock — this
    // guards against the client re-sending base amounts and accidentally
    // restocking a LOT's original 조정량.
    applyMaterialEdit?: boolean;
  },
): Promise<ItemLot | null> {
  const existing = (await listItemLots()).find((l) => l.id === id);
  if (!existing) return null;
  const merged: ItemLot = { ...existing, ...patch, id };

  const becameProgressing =
    (patch.status === "진행중" || patch.status === "완료") &&
    existing.status !== "진행중" &&
    existing.status !== "완료";
  // An edit that keeps an already-진행중/완료 LOT in a progressing state and
  // EXPLICITLY restates its actual-input amounts (e.g. extra grams logged
  // mid-run). Gated behind applyMaterialEdit so unrelated edits never touch
  // stock.
  const editedWhileProgressing =
    !becameProgressing &&
    patch.applyMaterialEdit === true &&
    (existing.status === "진행중" || existing.status === "완료") &&
    (merged.status === "진행중" || merged.status === "완료") &&
    (patch.actualMaterials?.length ?? 0) > 0;
  let warning: string | undefined;
  if (becameProgressing) {
    warning = await consumeFromExplicit(merged, patch.actualMaterials ?? []);
  } else if (editedWhileProgressing) {
    // Re-deduct ONLY the delta vs what was already recorded — never the full
    // amount again (that was the bug: edits saved to the LOT row but never
    // touched 원료재고).
    warning = await reconcileMaterials(merged, patch.actualMaterials ?? []);
  }

  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (rowNum) await strictUpdateRow(TAB, rowNum, toRow(merged), [...ITEM_LOT_HEADER]);
  } else {
    const store = getStore().upcycleLots;
    const idx = store.findIndex((l) => l.id === id);
    if (idx !== -1) store[idx] = merged;
  }

  if (patch.status && patch.status !== existing.status) {
    await logWork({
      type: patch.status === "완료" ? "품목 입고" : "수정",
      target: `${merged.lotCode} / ${merged.itemNo}번`,
      change: `상태 ${existing.status} → ${patch.status}`,
      assignee: merged.assignee,
      note: warning ?? merged.note,
    });
  }

  if (patch.status === "완료" && existing.status !== "완료") {
    const item = await getItemByNo(merged.itemNo);
    // Inventory increase: strictly actualProducedQty. Legacy fallback to
    // completedQty for back-compat. NEVER targetQty.
    const qty = merged.actualProducedQty ?? merged.completedQty ?? 0;
    if (qty > 0) {
      await addItemStock(merged.itemNo, qty);
      await logWork({
        type: "품목 입고",
        target: `${merged.itemNo}번 ${item?.colorName ?? ""}`,
        change: `+${qty}${item?.unit ?? "개"} (actualProducedQty)`,
        assignee: merged.assignee,
        note: `LOT ${merged.lotCode}`,
        time: todayISO(),
      });
    }
  }

  return merged;
}

/**
 * Soft-delete an unstarted LOT.
 *
 *   refused if:
 *     - LOT not found
 *     - status not in ["예정", "보류"] (활동 시작된 LOT은 폐기 처리만 허용)
 *     - 품목생산투입원료 rows exist for this lotCode (data already moved)
 *
 *   side effect (one-shot):
 *     - LOT row status → "삭제됨"  (soft delete; Apps Script has no
 *       row-delete action, so we mark the row instead. Client filters
 *       "삭제됨" from default views.)
 *
 *   NOT touched:
 *     - 원료재고  (no raw-material restoration — would risk double-restore)
 *     - 품목재고  (예정/보류 status shouldn't have triggered an add;
 *                  if it somehow did, the exec-rows guard catches it)
 *     - 품목생산투입원료 / 원료입출고
 */
export async function deleteItemLot(id: string): Promise<{ lot: ItemLot }> {
  const existing = (await listItemLots()).find((l) => l.id === id);
  if (!existing) throw new Error(`품목생산LOT에서 id='${id}' 행을 찾지 못했습니다.`);
  if (existing.status === "삭제됨") {
    throw new Error(`이미 삭제된 LOT입니다 (LOT ${existing.lotCode}).`);
  }
  if (existing.status !== "예정" && existing.status !== "보류") {
    throw new Error(
      `예정 또는 보류 상태의 LOT만 삭제할 수 있습니다 (현재: ${existing.status}). ` +
      `이미 원료/재고가 반영된 LOT입니다. 삭제 대신 폐기 처리하세요.`,
    );
  }
  // Safety: refuse if any 품목생산투입원료 rows reference this LOT — the
  // exec history may be downstream of real material movement, and we never
  // auto-rollback raw materials.
  const { listExecutionMaterials } = await import("./upcycleProductionExecution");
  const execs = await listExecutionMaterials();
  const hasExec = execs.some(
    (e) => (e.lotId && e.lotId === existing.id) || (e.lotNo && e.lotNo === existing.lotCode),
  );
  if (hasExec) {
    throw new Error("이미 원료 사용 이력이 있어 삭제할 수 없습니다. 폐기 처리하세요.");
  }

  const merged: ItemLot = { ...existing, status: "삭제됨" };
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) throw new Error(`LOT row not found in sheet (id=${id})`);
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...ITEM_LOT_HEADER]);
  } else {
    const store = getStore().upcycleLots;
    const idx = store.findIndex((l) => l.id === id);
    if (idx !== -1) store[idx] = merged;
  }
  await logWork({
    type: "수정",
    target: `삭제 ${merged.lotCode} / ${merged.itemNo}번`,
    change: `예정/보류 LOT 삭제 (재고 변동 없음)`,
    assignee: existing.assignee,
    note: "",
  });
  return { lot: merged };
}

/**
 * Non-destructive 폐기 (disposal) for a 진행중 / 완료 LOT.
 *
 *   refused if:
 *     - LOT not found
 *     - status === "폐기"     (idempotency — never double-dispose)
 *     - status not in ["진행중", "완료"]  (예정 / 보류 stay as-is)
 *
 *   side effects (one-shot, exactly once):
 *     1) 품목재고.stock -= disposalQty  (reverses the actualProducedQty add)
 *     2) LOT row: status="폐기", disposalDate / disposalQty / disposalReason
 *        / disposalWorker filled
 *     3) 작업이력 row, type="수정", change describing the disposal
 *
 *   NOT touched:
 *     - 원료재고 (raw materials stay consumed — disposal does not return them)
 *     - 품목생산투입원료 rows (history kept verbatim)
 */
export async function disposeItemLot(
  id: string,
  input: {
    disposalDate: string;
    disposalQty?: number;        // defaults to actualProducedQty
    disposalReason: string;
    disposalWorker: string;
  },
): Promise<{ lot: ItemLot; reversedQty: number }> {
  const existing = (await listItemLots()).find((l) => l.id === id);
  if (!existing) throw new Error(`품목생산LOT에서 id='${id}' 행을 찾지 못했습니다.`);
  if (existing.status === "폐기") {
    throw new Error(`이미 폐기 처리된 LOT입니다 (LOT ${existing.lotCode}). 중복 폐기는 자동으로 차단됩니다.`);
  }
  if (existing.status !== "진행중" && existing.status !== "완료") {
    throw new Error(
      `예정/보류 상태의 LOT은 폐기 처리할 수 없습니다 (현재: ${existing.status}). ` +
      `먼저 진행중 또는 완료로 전환하거나, 단순 취소는 LOT을 직접 삭제하세요.`,
    );
  }
  const reversedQty = input.disposalQty ?? existing.actualProducedQty ?? existing.completedQty ?? 0;
  // Reverse 품목재고 once. Raw material stock is NOT restored.
  if (reversedQty > 0) {
    await addItemStock(existing.itemNo, -reversedQty);
  }
  const merged: ItemLot = {
    ...existing,
    status: "폐기",
    disposalDate: input.disposalDate,
    disposalQty: reversedQty,
    disposalReason: input.disposalReason,
    disposalWorker: input.disposalWorker,
  };
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) throw new Error(`LOT row not found in sheet (id=${id})`);
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...ITEM_LOT_HEADER]);
  } else {
    const store = getStore().upcycleLots;
    const idx = store.findIndex((l) => l.id === id);
    if (idx !== -1) store[idx] = merged;
  }
  await logWork({
    type: "수정",
    target: `폐기 ${merged.lotCode} / ${merged.itemNo}번`,
    change: `LOT 폐기 — 품목재고 ${reversedQty > 0 ? `−${reversedQty}` : "변동 없음"} · 사유: ${input.disposalReason}`,
    assignee: input.disposalWorker || existing.assignee,
    note: `${input.disposalDate}${input.disposalQty != null && input.disposalQty !== existing.actualProducedQty ? ` · 부분 폐기 ${input.disposalQty}` : ""}`,
  });
  return { lot: merged, reversedQty };
}
