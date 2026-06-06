import type {
  FragranceLot,
  FragranceExecutionMaterial,
  FragranceInventoryStatus,
  Material,
  MaterialCategory,
} from "@/types";
import {
  findRowNumberByColumn,
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  strictBatchAppendRows,
  strictUpdateRow,
  useSheets,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId, generateFragranceLotCode, generateLotCode } from "@/lib/utils";
import { consumeMaterials, listMaterials, updateMaterial, createMaterial } from "./materials";
import { getFragranceByCode, addFragranceStock } from "./fragrances";
import { appendMaterialTransaction } from "./materialTransactions";
import { logWork } from "./history";
import { nextMaterialCode } from "@/lib/materialCode";

// ─── Sheet tabs ───────────────────────────────────────────
const LOT_TAB = SHEET_TABS.fragranceLots;
const EXEC_TAB = SHEET_TABS.fragranceExecution;

// ─── Canonical schemas (strict header mapping) ────────────
export const FRAGRANCE_LOT_HEADER = [
  "id", "lotNo", "fragranceCode", "fragranceName",
  "actualProducedQty", "worker", "productionDate",
  "actualMaterialTotalCost", "actualUnitCost", "note", "createdAt",
  "registerToInventory", "inventoryStatus",
  // New simplified status (테스트 / 완료 / 폐기).
  "status",
  // 배합 / 시향 process tracking.
  "mixingDate", "mixingWorker", "mixingNote",
  "scentTestDate", "scentTestWorker", "scentTestNote",
  // 폐기 처리 fields.
  "disposalDate", "disposalQty", "disposalReason", "disposalWorker",
] as const;

export const FRAGRANCE_EXECUTION_HEADER = [
  "id", "lotNo", "fragranceCode", "materialCode", "materialName",
  "baseQty", "multiplier", "baseTotalQty", "adjustmentQty", "actualQty",
  "unit", "unitCost", "materialCost", "createdAt",
] as const;

function lotToRow(l: FragranceLot): (string | number | boolean)[] {
  return [
    l.id, l.lotNo, l.fragranceCode, l.fragranceName,
    l.actualProducedQty, l.worker, l.productionDate,
    l.actualMaterialTotalCost, l.actualUnitCost, l.note, l.createdAt,
    l.registerToInventory ? "TRUE" : "FALSE",
    l.inventoryStatus,
    l.status ?? "",
    l.mixingDate ?? "", l.mixingWorker ?? "", l.mixingNote ?? "",
    l.scentTestDate ?? "", l.scentTestWorker ?? "", l.scentTestNote ?? "",
    l.disposalDate ?? "", l.disposalQty ?? "",
    l.disposalReason ?? "", l.disposalWorker ?? "",
  ];
}

function lotFromRow(r: Record<string, string>): FragranceLot {
  // Tolerate legacy rows (pre-registration-fields):
  //   - missing registerToInventory → default TRUE (matches prior behavior)
  //   - missing inventoryStatus     → default "사용가능" (was registered)
  const rawReg = (r.registerToInventory ?? "").toString().trim().toUpperCase();
  const registerToInventory = rawReg === "" ? true : (rawReg === "TRUE" || rawReg === "1" || rawReg === "Y");
  const rawStatus = (r.inventoryStatus ?? "").toString().trim() as FragranceInventoryStatus;
  const inventoryStatus: FragranceInventoryStatus =
    rawStatus === "대기" || rawStatus === "사용가능" || rawStatus === "테스트" || rawStatus === "폐기"
      ? rawStatus
      : (registerToInventory ? "사용가능" : "대기");
  return {
    id: r.id ?? "",
    lotNo: r.lotNo ?? "",
    fragranceCode: r.fragranceCode ?? "",
    fragranceName: r.fragranceName ?? "",
    actualProducedQty: Number(r.actualProducedQty) || 0,
    worker: r.worker ?? "",
    productionDate: r.productionDate ?? "",
    actualMaterialTotalCost: Number(r.actualMaterialTotalCost) || 0,
    actualUnitCost: Number(r.actualUnitCost) || 0,
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
    registerToInventory,
    inventoryStatus,
    // New simplified status. Empty on legacy rows — UI shows "(미지정)".
    status: (() => {
      const v = (r.status ?? "").toString().trim();
      if (v === "테스트" || v === "완료" || v === "폐기") return v as FragranceLot["status"];
      return undefined;
    })(),
    mixingDate: r.mixingDate ?? "",
    mixingWorker: r.mixingWorker ?? "",
    mixingNote: r.mixingNote ?? "",
    scentTestDate: r.scentTestDate ?? "",
    scentTestWorker: r.scentTestWorker ?? "",
    scentTestNote: r.scentTestNote ?? "",
    disposalDate: r.disposalDate ?? "",
    disposalQty: (() => {
      const n = Number(r.disposalQty);
      return Number.isFinite(n) && n !== 0 ? n : undefined;
    })(),
    disposalReason: r.disposalReason ?? "",
    disposalWorker: r.disposalWorker ?? "",
  };
}

function execToRow(m: FragranceExecutionMaterial): (string | number | boolean)[] {
  return [
    m.id, m.lotNo, m.fragranceCode, m.materialCode, m.materialName,
    m.baseQty, m.multiplier, m.baseTotalQty, m.adjustmentQty, m.actualQty,
    m.unit, m.unitCost, m.materialCost, m.createdAt,
  ];
}

function execFromRow(r: Record<string, string>): FragranceExecutionMaterial {
  const base = Number(r.baseQty) || 0;
  const mul = Number(r.multiplier) || 1;
  const baseTotal = Number(r.baseTotalQty) || base * mul;
  const adj = Number(r.adjustmentQty) || 0;
  const actual = Number(r.actualQty) || baseTotal + adj;
  const uc = Number(r.unitCost) || 0;
  const mc = Number(r.materialCost) || actual * uc;
  return {
    id: r.id ?? "",
    lotNo: r.lotNo ?? "",
    fragranceCode: r.fragranceCode ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    baseQty: base,
    multiplier: mul,
    baseTotalQty: baseTotal,
    adjustmentQty: adj,
    actualQty: actual,
    unit: r.unit ?? "",
    unitCost: uc,
    materialCost: mc,
    createdAt: r.createdAt ?? "",
  };
}

// ─── Reads ────────────────────────────────────────────────
export async function listFragranceLots(): Promise<FragranceLot[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(LOT_TAB);
    return rows.map(lotFromRow);
  }
  return getStore().fragranceLots ?? [];
}

export async function listFragranceExecution(): Promise<FragranceExecutionMaterial[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(EXEC_TAB);
    return rows.map(execFromRow);
  }
  return getStore().fragranceExecution ?? [];
}

// ─── Produced-fragrance upsert into 원료재고 ──────────────
/**
 * After the LOT is recorded, register the produced fragrance back into
 * 원료재고 so 품목BOM can reference it as a normal material.
 *
 *   - existing 원료재고 row matched by materialCode = fragranceCode
 *     → stock += actualProducedQty, unitCost = actualUnitCost
 *     (existing name / id / supplier are NOT overwritten per safety spec)
 *   - no match → create a new Material with category="향료"
 */
async function upsertFragranceAsMaterial(args: {
  fragranceCode: string;
  fragranceName: string;
  addedStock: number;
  unitCost: number;
}): Promise<{ material: Material; created: boolean }> {
  const materials = await listMaterials();
  // Resolve the materialCode to use in 원료재고:
  //   - if the fragrance has a usable fragranceCode, use it verbatim
  //   - if empty, auto-generate next F-### based on existing 원료재고 F codes
  // We only auto-generate when the new fragrance has no code to begin with.
  // Existing 원료재고 rows are never rewritten elsewhere.
  let code = String(args.fragranceCode ?? "").trim();
  if (!code) {
    const existingCodes = materials.map((m) => m.materialCode || "").filter(Boolean);
    code = nextMaterialCode("향료", existingCodes);
  }
  const existing = code
    ? materials.find((m) => (m.materialCode || m.id) === code)
    : undefined;
  if (existing) {
    // Produced fragrance is ALWAYS classified as 향료. If a legacy row was
    // previously created with the wrong category (기타 / 기본원료 / etc.),
    // promote it to 향료 on this upsert. Unit is forced to ml. materialCode
    // and materialName are forced to the canonical fragrance values so a
    // mismatched name from an earlier manual edit gets re-aligned.
    const merged = await updateMaterial(existing.id, {
      materialCode: code,
      materialName: args.fragranceName,
      name: args.fragranceName,
      category: "향료" as MaterialCategory,
      stock: existing.stock + args.addedStock,
      unit: "ml",
      unitCost: args.unitCost,
      costUnit: "ml",
    });
    return { material: merged ?? existing, created: false };
  }
  // Create a brand-new 향료 material. category, unit, costUnit are pinned.
  const created = await createMaterial({
    materialCode: code,
    materialName: args.fragranceName,
    name: args.fragranceName,
    category: "향료" as MaterialCategory,
    stock: args.addedStock,
    unit: "ml",
    safetyStock: 0,
    supplier: "",
    unitPrice: args.unitCost,
    unitCost: args.unitCost,
    costUnit: "ml",
    inboundDate: "",
    expiryDate: "",
    msds: false,
    note: "향 생산으로 자동 등록",
  });
  return { material: created, created: true };
}

// ─── Production save (the big integration) ────────────────
export async function createFragranceLot(input: {
  productionDate: string;
  fragranceCode: string;
  multiplier: number;
  actualProducedQty: number;
  worker: string;
  note: string;
  lotNo?: string;
  actualMaterials: Array<{
    materialCode: string;
    materialName?: string;
    baseQty: number;
    adjustmentQty: number;
    actualQty: number;
    unit: string;
    unitCost: number;
    materialCost: number;
  }>;
  // If false, the produced fragrance is NOT added to 원료재고 and the
  // finished-fragrance 원료입출고 입고 row is skipped. Ingredients are still
  // deducted and LOT/투입원료 are still recorded. Defaults to true.
  registerToInventory?: boolean;
  assignee?: string;
  // New simplified status (테스트 / 완료 / 폐기). When "테스트" the LOT is
  // recorded but ingredients are NOT deducted and the produced fragrance
  // is NOT added to inventory. When omitted (or other values) we fall back
  // to the legacy registerToInventory behavior for back-compat.
  status?: "테스트" | "완료" | "폐기";
  mixingDate?: string;
  mixingWorker?: string;
  mixingNote?: string;
  scentTestDate?: string;
  scentTestWorker?: string;
  scentTestNote?: string;
}): Promise<{
  lot: FragranceLot;
  material: Material | null;
  createdMaterial: boolean;
  warning?: string;
}> {
  const fragrance = await getFragranceByCode(input.fragranceCode);
  if (!fragrance) {
    throw new Error(`향마스터에서 fragranceCode='${input.fragranceCode}' 행을 찾지 못했습니다.`);
  }

  const now = new Date().toISOString();
  const actualMaterialTotalCost = input.actualMaterials.reduce((s, r) => s + (Number(r.materialCost) || 0), 0);
  const actualUnitCost = input.actualProducedQty > 0
    ? actualMaterialTotalCost / input.actualProducedQty
    : 0;

  // Resolve lotNo:
  //   1) client-provided wins (override-from-the-form)
  //   2) NEW canonical: F-YYYYMMDD-###  (fragrance-only prefix; collision-free
  //      with 품목생산 LOTs which use LOT-… prefix)
  //   3) legacy LOT-{fragranceCode}-{YYYYMMDD}-{seq2} kept only as final
  //      fallback when productionDate is malformed.
  const existingLots = await listFragranceLots();
  const newCanonical = generateFragranceLotCode(
    input.productionDate,
    existingLots.map((l) => l.lotNo),
  );
  const legacyCanonical = generateLotCode(input.fragranceCode, input.productionDate, existingLots.map((l) => ({
    itemNo: l.fragranceCode,
    date: l.productionDate,
  })));
  const lotNo = (input.lotNo && input.lotNo.trim())
    || newCanonical
    || legacyCanonical;

  // ─── 테스트 status — no stock movement ───────────────────
  // Per spec: 테스트 LOTs record an audit row + execution rows but MUST NOT
  // deduct raw materials or add to fragrance inventory. The legacy
  // registerToInventory flag is forced to false in this case.
  const isTest = input.status === "테스트";
  const registerToInventory = isTest ? false : (input.registerToInventory !== false);
  const lot: FragranceLot = {
    id: genId("FL"),
    lotNo,
    fragranceCode: input.fragranceCode,
    fragranceName: fragrance.fragranceName,
    actualProducedQty: input.actualProducedQty,
    worker: input.worker,
    productionDate: input.productionDate,
    actualMaterialTotalCost: Math.round(actualMaterialTotalCost),
    actualUnitCost: Math.round(actualUnitCost),
    note: input.note,
    createdAt: now,
    registerToInventory,
    inventoryStatus: isTest ? "테스트" : (registerToInventory ? "사용가능" : "대기"),
    status: input.status,
    mixingDate: input.mixingDate,
    mixingWorker: input.mixingWorker,
    mixingNote: input.mixingNote,
    scentTestDate: input.scentTestDate,
    scentTestWorker: input.scentTestWorker,
    scentTestNote: input.scentTestNote,
  };

  // 1. Deduct ingredients from 원료재고 (strict). 테스트 status skips this.
  const materials = await listMaterials();
  const uses = isTest ? [] : input.actualMaterials
    .map((m) => {
      const found = materials.find(
        (x) => x.id === m.materialCode || x.materialCode === m.materialCode,
      );
      return { materialId: found?.id ?? m.materialCode, amount: m.actualQty };
    })
    .filter((u) => u.amount !== 0);
  let warning: string | undefined;
  if (isTest) {
    warning = "테스트 상태이므로 원료 차감 및 향료 재고 등록을 건너뜁니다.";
  }
  if (uses.length > 0) {
    const result = await consumeMaterials(uses);
    if (!result.ok) {
      warning = `원료 재고 부족 — ${result.missing.length}종 (LOT은 생성됨)`;
    }
  }

  // 2. Append 향생산LOT.
  if ((await useSheets())) {
    await strictAppendRow(LOT_TAB, lotToRow(lot), [...FRAGRANCE_LOT_HEADER]);
  } else {
    const s = getStore();
    if (!s.fragranceLots) s.fragranceLots = [];
    s.fragranceLots.unshift(lot);
  }

  // 3. Append 향생산투입원료 rows (strict batch).
  const execRows: FragranceExecutionMaterial[] = input.actualMaterials.map((m) => {
    const baseTotalQty = m.baseQty * input.multiplier;
    return {
      id: genId("FE"),
      lotNo,
      fragranceCode: input.fragranceCode,
      materialCode: m.materialCode,
      materialName: m.materialName ?? "",
      baseQty: m.baseQty,
      multiplier: input.multiplier,
      baseTotalQty,
      adjustmentQty: m.adjustmentQty,
      actualQty: m.actualQty,
      unit: m.unit,
      unitCost: m.unitCost,
      materialCost: m.materialCost,
      createdAt: now,
    };
  });
  if (execRows.length > 0) {
    if ((await useSheets())) {
      await strictBatchAppendRows(EXEC_TAB, execRows.map(execToRow), [...FRAGRANCE_EXECUTION_HEADER]);
    } else {
      const s = getStore();
      if (!s.fragranceExecution) s.fragranceExecution = [];
      s.fragranceExecution.push(...execRows);
    }
  }

  // 4. Upsert produced fragrance back into 원료재고 — ONLY when
  //    registerToInventory is true. Test/sample/QC-pending batches skip
  //    this step and can be registered later via registerLotToInventory.
  let material: Material | null = null;
  let created = false;
  if (registerToInventory) {
    const r = await upsertFragranceAsMaterial({
      fragranceCode: input.fragranceCode,
      fragranceName: fragrance.fragranceName,
      addedStock: input.actualProducedQty,
      unitCost: lot.actualUnitCost,
    });
    material = r.material;
    created = r.created;
    // 5. Also bump 향마스터.stock so the master reflects the new run.
    await addFragranceStock(input.fragranceCode, input.actualProducedQty);
  }

  // 6. Append 원료입출고 rows: one 생산사용 per material + one 입고 for the
  // finished fragrance. Each is independently strict-written.
  for (const row of input.actualMaterials) {
    try {
      await appendMaterialTransaction({
        transactionDate: input.productionDate,
        transactionType: "생산사용",
        materialCode: row.materialCode,
        materialName: row.materialName ?? "",
        manufacturer: "",
        supplier: "",
        qty: row.actualQty,
        unit: row.unit,
        unitCost: row.unitCost,
        capacity: "",
        totalCost: row.materialCost,
        lotNo,
        expiryDate: "",
        disposalReason: "",
        note: `향 생산 (${input.fragranceCode})`,
        assignee: input.assignee,
      });
    } catch (err) {
      // Don't block the production save if the transaction-log append fails.
      warning = (warning ? warning + " · " : "") + `원료입출고 기록 일부 실패: ${(err as Error).message}`;
    }
  }
  // Finished-fragrance 입고 row only when registering to inventory.
  if (registerToInventory) {
    try {
      await appendMaterialTransaction({
        transactionDate: input.productionDate,
        transactionType: "입고",
        materialCode: input.fragranceCode,
        materialName: fragrance.fragranceName,
        manufacturer: "",
        supplier: "",
        qty: input.actualProducedQty,
        unit: "ml",
        unitCost: lot.actualUnitCost,
        capacity: "",
        totalCost: lot.actualMaterialTotalCost,
        lotNo,
        expiryDate: "",
        disposalReason: "",
        note: `향 생산 결과물 (${input.fragranceCode})`,
        assignee: input.assignee,
      });
    } catch (err) {
      warning = (warning ? warning + " · " : "") + `완성 향 원료입출고 기록 실패: ${(err as Error).message}`;
    }
  }

  await logWork({
    type: "품목 생산",
    target: `향 ${input.fragranceCode} / LOT ${lotNo}`,
    change: `${input.actualProducedQty}ml · 1ml 원가 ${lot.actualUnitCost.toLocaleString("ko-KR")}원`,
    assignee: input.worker || input.assignee || "",
    note: input.note,
  });

  return { lot, material, createdMaterial: created, warning };
}

// Re-export the row-number lookup utility callers might need (currently
// unused outside the service but exposed for symmetry with itemProduction).
export async function findFragranceLotRowNumberById(id: string): Promise<number | null> {
  return findRowNumberByColumn(LOT_TAB, "id", id);
}

/**
 * Promote a previously-skipped LOT into 원료재고. Used by the [재고 등록]
 * action button on the LOT list. Idempotent: refuses to register a LOT that
 * is already registered.
 *
 *   refused if:
 *     - lot not found
 *     - lot.registerToInventory === true   (already registered)
 *     - lot.inventoryStatus !== "대기"      (e.g. 사용가능 / 테스트 / 폐기)
 *
 *   side effects (only on success):
 *     1) upsert 원료재고 row (향료 category) with actualProducedQty + actualUnitCost
 *     2) 향마스터.stock += actualProducedQty
 *     3) append 원료입출고 입고 row for the finished fragrance
 *     4) update LOT row: registerToInventory=true, inventoryStatus="사용가능"
 */
export async function registerLotToInventory(
  id: string,
  opts?: { assignee?: string },
): Promise<{
  lot: FragranceLot;
  material: Material | null;
  createdMaterial: boolean;
  warning?: string;
}> {
  const lots = await listFragranceLots();
  const lot = lots.find((l) => l.id === id);
  if (!lot) throw new Error(`향생산LOT에서 id='${id}' 행을 찾지 못했습니다.`);
  if (lot.registerToInventory || lot.inventoryStatus !== "대기") {
    throw new Error(
      `이 LOT은 이미 처리되었습니다 (registerToInventory=${lot.registerToInventory}, inventoryStatus=${lot.inventoryStatus}). 중복 등록은 방지됩니다.`,
    );
  }

  // 1. Upsert 원료재고 + 2. bump 향마스터 stock.
  const { material, created } = await upsertFragranceAsMaterial({
    fragranceCode: lot.fragranceCode,
    fragranceName: lot.fragranceName,
    addedStock: lot.actualProducedQty,
    unitCost: lot.actualUnitCost,
  });
  await addFragranceStock(lot.fragranceCode, lot.actualProducedQty);

  // 3. Append 원료입출고 입고 row.
  let warning: string | undefined;
  try {
    await appendMaterialTransaction({
      transactionDate: lot.productionDate,
      transactionType: "입고",
      materialCode: lot.fragranceCode,
      materialName: lot.fragranceName,
      manufacturer: "",
      supplier: "",
      qty: lot.actualProducedQty,
      unit: "ml",
      unitCost: lot.actualUnitCost,
      capacity: "",
      totalCost: lot.actualMaterialTotalCost,
      lotNo: lot.lotNo,
      expiryDate: "",
      disposalReason: "",
      note: `향 LOT 재고 등록 (${lot.fragranceCode})`,
      assignee: opts?.assignee,
    });
  } catch (err) {
    warning = `원료입출고 입고 기록 실패: ${(err as Error).message}`;
  }

  // 4. Update LOT row in place (strict).
  const merged: FragranceLot = {
    ...lot,
    registerToInventory: true,
    inventoryStatus: "사용가능",
  };
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(LOT_TAB, "id", lot.id);
    if (rowNum) {
      await strictUpdateRow(LOT_TAB, rowNum, lotToRow(merged), [...FRAGRANCE_LOT_HEADER]);
    } else {
      warning = (warning ? warning + " · " : "") + `LOT 상태 업데이트 실패: id=${lot.id} 행을 찾지 못했습니다.`;
    }
  } else {
    const s = getStore();
    if (s.fragranceLots) {
      const idx = s.fragranceLots.findIndex((l) => l.id === lot.id);
      if (idx !== -1) s.fragranceLots[idx] = merged;
    }
  }

  await logWork({
    type: "원료 입고",
    target: `향 ${lot.fragranceCode} / LOT ${lot.lotNo}`,
    change: `${lot.actualProducedQty}ml · 사후 재고 등록 (inventoryStatus 대기 → 사용가능)`,
    assignee: opts?.assignee ?? "",
    note: "",
  });

  return { lot: merged, material, createdMaterial: created, warning };
}

/**
 * Dispose of a fragrance LOT — non-destructive 폐기 처리.
 *
 *   refused if:
 *     - LOT not found
 *     - lot.status === "폐기"           (idempotent — never double-dispose)
 *
 *   side effects (one-shot, exactly once):
 *     1) 향마스터.stock -= disposalQty   (when registerToInventory was true,
 *        the fragrance was added there at creation; reverse it here)
 *     2) 원료재고 향료 row: stock -= disposalQty  (mirror reverse)
 *     3) 원료입출고 폐기 row appended (audit trail)
 *     4) LOT row: status="폐기" + disposalDate/qty/reason/worker filled
 *     5) 작업이력 row
 *
 *   NOT touched:
 *     - 원료재고 raw ingredients (raw materials stay consumed)
 *     - 향생산투입원료 rows (history preserved verbatim)
 */
export async function disposeFragranceLot(
  id: string,
  input: {
    disposalDate: string;
    disposalQty?: number;
    disposalReason: string;
    disposalWorker: string;
  },
): Promise<{ lot: FragranceLot; reversedQty: number; warning?: string }> {
  const lots = await listFragranceLots();
  const existing = lots.find((l) => l.id === id);
  if (!existing) throw new Error(`향생산LOT에서 id='${id}' 행을 찾지 못했습니다.`);
  if (existing.status === "폐기" || existing.inventoryStatus === "폐기") {
    throw new Error(`이미 폐기 처리된 LOT입니다 (LOT ${existing.lotNo}). 중복 폐기는 자동으로 차단됩니다.`);
  }
  if (!input.disposalReason || !input.disposalReason.trim()) {
    throw new Error("폐기 사유를 입력하세요.");
  }
  if (!input.disposalWorker || !input.disposalWorker.trim()) {
    throw new Error("폐기 담당자를 선택하세요.");
  }
  const reversedQty = input.disposalQty ?? existing.actualProducedQty ?? 0;

  let warning: string | undefined;
  // Decrement 향마스터.stock (only if the LOT had been registered).
  if (existing.registerToInventory && reversedQty > 0) {
    try {
      await addFragranceStock(existing.fragranceCode, -reversedQty);
    } catch (err) {
      warning = (warning ? warning + " · " : "")
        + `향마스터 stock 감소 실패: ${(err as Error).message}`;
    }
    // Mirror-decrement 원료재고 (the 향료 row, if present).
    try {
      const mats = await listMaterials();
      const m = mats.find(
        (x) => (x.materialCode || x.id) === existing.fragranceCode,
      );
      if (m && m.stock > 0) {
        await updateMaterial(m.id, { stock: Math.max(0, m.stock - reversedQty) });
      }
    } catch (err) {
      warning = (warning ? warning + " · " : "")
        + `원료재고 향료 stock 감소 실패: ${(err as Error).message}`;
    }
    // Audit row in 원료입출고.
    try {
      await appendMaterialTransaction({
        transactionDate: input.disposalDate,
        transactionType: "폐기",
        materialCode: existing.fragranceCode,
        materialName: existing.fragranceName,
        manufacturer: "",
        supplier: "",
        qty: reversedQty,
        unit: "ml",
        unitCost: existing.actualUnitCost,
        capacity: "",
        totalCost: existing.actualUnitCost * reversedQty,
        lotNo: existing.lotNo,
        expiryDate: "",
        disposalReason: input.disposalReason,
        note: `향 LOT 폐기 (${existing.fragranceCode})`,
        assignee: input.disposalWorker,
      });
    } catch (err) {
      warning = (warning ? warning + " · " : "")
        + `원료입출고 폐기 기록 실패: ${(err as Error).message}`;
    }
  }

  const merged: FragranceLot = {
    ...existing,
    status: "폐기",
    inventoryStatus: "폐기",
    disposalDate: input.disposalDate,
    disposalQty: reversedQty,
    disposalReason: input.disposalReason,
    disposalWorker: input.disposalWorker,
  };
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(LOT_TAB, "id", existing.id);
    if (rowNum) {
      await strictUpdateRow(LOT_TAB, rowNum, lotToRow(merged), [...FRAGRANCE_LOT_HEADER]);
    } else {
      warning = (warning ? warning + " · " : "")
        + `LOT 상태 업데이트 실패: id=${existing.id} 행을 찾지 못했습니다.`;
    }
  } else {
    const s = getStore();
    if (s.fragranceLots) {
      const idx = s.fragranceLots.findIndex((l) => l.id === existing.id);
      if (idx !== -1) s.fragranceLots[idx] = merged;
    }
  }

  await logWork({
    type: "수정",
    target: `폐기 (향) ${existing.lotNo} / ${existing.fragranceCode}`,
    change: `LOT 폐기 — 향 재고 ${reversedQty > 0 ? `−${reversedQty}ml` : "변동 없음"} · 사유: ${input.disposalReason}`,
    assignee: input.disposalWorker || existing.worker || "",
    note: input.disposalDate,
  });

  return { lot: merged, reversedQty, warning };
}
