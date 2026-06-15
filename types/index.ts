// Domain types for B.fter Ops
// Core unit: 품목번호 (item number). Inventory is tracked at three levels:
//   1) 원료재고 (Material)
//   2) 품목재고 (Item)
//   3) 완제품세트재고 (FinishedSet)

// ─── Materials ─────────────────────────────────────────────
export type MaterialCategory =
  // Spec categories (the 8 used by the materialCode prefix system).
  | "기본원료"
  | "왁스"
  | "오일"
  | "안료"
  | "향료"
  | "케미컬"
  | "패키지"
  | "기타"
  // Legacy categories — preserved so existing 원료재고 rows remain valid.
  | "바인더"
  | "용기"
  | "스티커";

export interface Material {
  id: string;
  // Canonical aliases for the user's spec headers (materialCode, materialName)
  // — populated by services/materials.ts:fromRow even when the sheet uses
  //   the legacy `name` column.
  materialCode?: string;
  materialName?: string;
  name: string;
  category: MaterialCategory;
  stock: number;
  unit: string;
  safetyStock: number;
  supplier: string;
  unitPrice: number;
  // Spec aliases for unitPrice / "원가 단위" — read from `unitCost`/`costUnit`
  // columns if present, otherwise fall back to `unitPrice` / `unit`.
  unitCost?: number;
  costUnit?: string;
  // Additional optional unit-cost columns the sheet may carry. Used as
  // fallbacks by costMath when unitCost/unitPrice are zero or missing.
  // Read-only; never written by this app.
  purchaseUnitCost?: number;
  price?: number;
  lastPurchasePrice?: number;
  // 구입용량 — numeric amount in `unit` that 1 purchase of `unitPrice` covers.
  // Drives auto-calculation: unitCost = unitPrice / capacity. String storage
  // so the sheet column can hold values like "1000" or "1.5".
  capacity?: string;
  inboundDate: string;
  expiryDate: string;
  msds: boolean;
  note: string;
}

// ─── Items ──────────────────────────────────────────────────
export type ProductType = "오일파스텔" | "수채물감" | "고체물감";
export const PRODUCT_TYPES: ProductType[] = ["오일파스텔", "수채물감", "고체물감"];

export type ItemStatus = "사용중" | "중단" | "테스트";
export const ITEM_STATUSES: ItemStatus[] = ["사용중", "중단", "테스트"];

export interface Item {
  id: string;
  itemNo: string;          // 품목번호 (예: "101")
  productType: ProductType;
  colorName: string;       // 표시색상명 (예: "거베라 레드")
  colorCode: string;       // 색상코드 (예: "OP-R-01")
  scentName: string;       // 향명 (예: "로즈")
  scentCode: string;       // 향코드 (예: "S-ROSE")
  status: ItemStatus;
  stock: number;
  safetyStock: number;
  unit: string;            // 개, g, ml
  productionUnit: number;  // 제조단위 (1회 생산 기본 수량)
  note: string;
}

// ─── Item BOM ───────────────────────────────────────────────
export interface ItemBomLine {
  id: string;
  itemNo: string;
  materialId: string;
  materialCode?: string;     // user-facing material code (alias of materialId when sheet has no separate code column)
  materialName: string;
  materialCategory: MaterialCategory;
  amountPerUnit: number;   // 단위당사용량 (one item piece) — also written to the `qty` column for spec parity
  unit: string;
  note: string;
}

// ─── Item production lot ───────────────────────────────────
export type LotStatus = "예정" | "진행중" | "완료" | "보류" | "테스트" | "폐기" | "삭제됨";
// Editable statuses for the status dropdown.
//   - 테스트 is included — trial records that DO NOT deduct materials or
//     add product stock (server enforces this in createItemLot).
//   - 폐기 and 삭제됨 are intentionally OMITTED — those are produced ONLY
//     by the explicit 폐기 처리 / 삭제 actions so inventory side-effects
//     stay safe.
export const LOT_STATUSES: LotStatus[] = ["예정", "보류", "테스트", "진행중", "완료"];

export interface ItemLot {
  id: string;
  date: string;            // 생산일
  itemNo: string;
  productType: ProductType;
  lotCode: string;         // 생산LOT (예: "LOT-2605-101-01")
  targetQty: number;
  completedQty: number;
  defectQty: number;
  assignee: string;
  status: LotStatus;
  note: string;
  // ─── Production execution tracking (all optional, additive) ───
  // Number of pieces this LOT actually produced (양품). Drives both inventory
  // and unit-cost division. Falls back to completedQty for back-compat.
  actualProducedQty?: number;
  // 작업배수 — multiplier vs. base BOM (e.g. 1.05 = +5% on the recipe; or the
  // number of pieces being produced if the BOM is per-piece). Used by:
  //   materialDeduction = (BOM.qty × multiplier) + adjustmentQty
  multiplier?: number;
  // Persisted cost roll-up for this LOT (computed at save time).
  actualMaterialTotalCost?: number;
  actualUnitCost?: number;
  // Optional flags kept for future use.
  formulaModified?: boolean;
  formulaChangeMemo?: string;
  reworkFlag?: boolean;
  testProductionFlag?: boolean;
  // ─── Process tracking (분산 · 사출 · QC) ────────────────────
  // Metadata-only — editing these fields must NOT trigger material deduction,
  // product-stock increase, or duplicate 품목생산투입원료 rows. All optional.
  mixingDate?: string;
  mixingWorker?: string;
  dispersionDate?: string;
  dispersionWorker?: string;
  injectionDate?: string;
  injectionWorker?: string;
  qcDate?: string;
  qcWorker?: string;
  // ─── Equipment (배합/분산/사출/QC 설비) — metadata only ─────
  // Free-text labels for which machine/equipment was used. Never affects
  // material deduction, product stock, or cost calculation.
  mixingMachine?: string;
  dispersionMachine?: string;
  injectionMachine?: string;
  qcEquipment?: string;
  // ─── Disposal (폐기 처리) — non-destructive ─────────────────
  // Set when a 진행중 / 완료 LOT is disposed of via the explicit 폐기 처리
  // action. 품목재고 is reversed once on transition; 원료 사용 history and
  // 품목생산투입원료 rows remain untouched. Idempotent — once status="폐기",
  // the action refuses to run again.
  disposalDate?: string;
  disposalQty?: number;
  disposalReason?: string;
  disposalWorker?: string;
}

// ─── Production execution actual material usage ──────────────
// Append-only per-material record for one production run. Lives in the
// 품목생산투입원료 sheet. Never modifies the base 품목BOM.
//
//   baseTotalQty = baseQty × multiplier
//   actualQty    = baseTotalQty + adjustmentQty
//   materialCost = actualQty × unitCost
//
// `baseQty` is a snapshot of the BOM.qty at the moment the row was created,
// so the calculation stays reproducible even if the BOM recipe is later
// edited.
export interface ProductionExecutionMaterial {
  id: string;
  lotId: string;           // refs ItemLot.id (database id)
  lotNo: string;           // refs ItemLot.lotCode (human-readable LOT identifier)
  itemNo: string;
  materialCode: string;
  materialName: string;
  baseQty: number;         // snapshot of BOM.qty
  multiplier: number;      // 작업배수 (matches the LOT's multiplier)
  baseTotalQty: number;    // = baseQty × multiplier
  adjustmentQty: number;   // user input, may be negative
  actualQty: number;       // = baseTotalQty + adjustmentQty
  unit: string;
  unitCost: number;        // material unit price at execution time (snapshot)
  materialCost: number;    // = actualQty × unitCost
  note: string;
  createdAt: string;       // ISO datetime
}

// ─── Set option / composition ──────────────────────────────
export type SetSize = "5색" | "10색" | "12색" | "24색" | "키트";
export const SET_SIZES: SetSize[] = ["5색", "10색", "12색", "24색", "키트"];

export interface SetOption {
  id: string;
  productType: ProductType;
  setSize: SetSize;
  optionName: string;       // 옵션명 (예: "거베라")
  optionCode: string;       // 옵션코드 (예: "OP-10-GBR")
  isActive: boolean;
  note: string;
  // 판매정보 — 시트에 컬럼 없으면 0 / 사용자가 직접 추가
  salePrice: number;
  commissionRate: number;
}

export interface SetComposition {
  id: string;
  setOptionId: string;
  itemNo: string;             // 호환 필드 — item 카테고리일 때 itemNo, material일 때 빈 문자열
  order: number;
  qty: number;
  note: string;
  // 카테고리 구분 (시트에 컬럼 있으면 사용, 없으면 fallback)
  //   "item"     → 품목마스터에서 itemNo 로 매칭 (기존 동작)
  //   "material" → 원료재고에서 componentCode 로 매칭
  componentType?: "item" | "material";
  componentCode?: string;     // item 일 때 itemNo / material 일 때 materialCode
  componentName?: string;     // 표시명 스냅샷 (옵션)
}

// ─── 세트BOM (조립 BOM) ───────────────────────────────────
// 세트 1개를 만들기 위해 필요한 모든 구성품. 색상(item) 뿐 아니라
// 패키지, 부자재, 옵션 구성품(컬러링북, 카드 등)도 포함됨.
//
// componentType 의미:
//   - "item"     → 품목 (componentCode = itemNo). 단가는 getAppliedUnitCost.
//   - "package"  → 패키지 박스/파우치. 시트의 unitCost 사용.
//   - "option"   → 옵션 구성품 (컬러링북, 안내카드). 시트의 unitCost 사용.
//   - "material" → 원료재고에서 가져오는 부자재. 시트의 unitCost 사용.
//
// 시트 헤더 (사용자가 직접 작성):
//   id / setCode / setName / componentType / componentCode / componentName /
//   qty / unitCost / unitCostSource / note / createdAt / updatedAt
// 시트가 없으면 readRowsOrEmpty 가 [] 반환하므로 앱은 깨지지 않음.
export type SetBomComponentType = "item" | "package" | "option" | "material";

// ─── Client (거래처) ────────────────────────────────────────
// 시트 헤더 (사용자가 직접 작성):
//   id / clientCode / clientName / contactName / phone / email /
//   country / region / address / note / status / createdAt / updatedAt
//
// status:
//   "활성" → 출고 picker / 목록에 표시
//   "비활성" → 목록에서 숨김 (또는 비활성 토글로 노출)
export type ClientStatus = "활성" | "비활성";
export const CLIENT_STATUSES: ClientStatus[] = ["활성", "비활성"];

export interface Client {
  id: string;
  clientCode: string;
  clientName: string;
  contactName: string;
  phone: string;
  email: string;
  country: string;
  region: string;
  address: string;
  note: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  // 거래처별 기본 단가 / 수수료율 — 출고 등록 시 자동 채워짐
  // unitPrice: 0 이면 사용자가 수동 입력
  // commissionRate: 0~100 (%) 기준
  unitPrice: number;
  commissionRate: number;
}

// ─── WeeklyReport (주간작업보고) ─────────────────────────────
// 개인별 주간 업무를 직접 작성·보관하는 독립 기능. 생산 데이터와 연동되지
// 않으며, 작성자가 한 주(월~일) 단위로 수행 업무 · 다음 주 계획 · 특이사항을
// 직접 기록합니다.
//
// 시트 헤더 (Google Sheets "주간작업보고" 탭):
//   id / weekStart / weekEnd / author / department /
//   thisWeek / nextWeek / issues / note / status / createdAt / updatedAt
//
// status:
//   "작성중" → 임시 저장 (수정 가능)
//   "제출"   → 제출 완료
//   "삭제됨" → 목록에서 숨김 (소프트 삭제)
export type WeeklyReportStatus = "작성중" | "제출" | "삭제됨";
export const WEEKLY_REPORT_STATUSES: WeeklyReportStatus[] = ["작성중", "제출"];

export interface WeeklyReport {
  id: string;
  weekStart: string;   // 주 시작일 (월요일) YYYY-MM-DD
  weekEnd: string;     // 주 종료일 (일요일) YYYY-MM-DD
  author: string;      // 작성자
  department: string;  // 부서 / 팀
  thisWeek: string;    // 이번 주 수행 업무
  nextWeek: string;    // 다음 주 계획
  issues: string;      // 특이사항 / 이슈
  note: string;        // 기타 비고
  status: WeeklyReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SetBomLine {
  id: string;
  setCode: string;            // 세트코드 — picker matching key
  setName: string;            // 세트명 (표시용)
  componentType: SetBomComponentType;
  componentCode: string;      // itemNo (type=item) / materialCode / free code
  componentName: string;
  qty: number;
  unitCost: number;           // 시트 등록 단가 (item 타입일 땐 무시 — applied로 덮어씀)
  unitCostSource: string;     // 단가 출처 라벨 (예: "공급가" / "BOM 산출" / 자유 텍스트)
  note: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Set assembly lot ───────────────────────────────────────
export interface SetAssemblyLot {
  id: string;
  date: string;             // 조립일
  setOptionId: string;
  productType: ProductType;
  setSize: SetSize;
  optionName: string;
  qty: number;              // 조립수량 (sets)
  assignee: string;
  status: LotStatus;
  note: string;
}

// ─── Finished set inventory ────────────────────────────────
export interface FinishedSet {
  id: string;
  productType: ProductType;
  setSize: SetSize;
  optionName: string;
  optionCode: string;
  stock: number;
  reserved: number;
  available: number;
  location: string;
  lastProducedAt: string;
}

// ─── Shipment ───────────────────────────────────────────────
export interface Shipment {
  id: string;
  date: string;             // 출고일
  productType: ProductType;
  setSize: SetSize;
  optionName: string;
  optionCode: string;
  qty: number;              // 출고수량
  customer: string;         // 거래처 (기존 — clientName 의 alias 로 유지)
  assignee: string;
  note: string;
  // ─── 거래처마스터 연동 필드 (사용자가 시트에 컬럼 추가 후 활성) ──
  // 컬럼이 없으면 reader 가 빈 문자열 반환 / writer 도 빈 문자열 기록.
  clientCode?: string;
  clientName?: string;
  contactName?: string;
  country?: string;
  region?: string;
  // 출고 저장 시점의 단가·수수료 스냅샷 (거래처 마스터 변경에도 보존)
  unitPrice?: number;
  commissionRate?: number;
}

// ─── Work history ───────────────────────────────────────────
export type WorkLogType =
  | "원료 입고"
  | "원료 차감"
  | "품목 생산"
  | "품목 입고"
  | "세트 조립"
  | "세트 입고"
  | "출고"
  | "원가 수정"
  | "수정";

export interface WorkLog {
  id: string;
  time: string;            // 일시 ISO
  type: WorkLogType;       // 작업유형
  target: string;
  change: string;          // 변경내용
  assignee: string;
  note: string;
}

// ─── Cost item ──────────────────────────────────────────────
// "id, 항목명, 금액, 단위, 적용기준, 비고" per spec
export interface CostItem {
  id: string;
  name: string;            // 항목명 (예: "오일파스텔 1개 인건비")
  amount: number;          // 금액 (원)
  unit: string;            // 단위 (예: "개", "세트", "g")
  basis: string;           // 적용기준 (예: "품목 생산 1개당")
  note: string;
}

// ─── Cost calculation snapshot ──────────────────────────────
// Saved record of a 1개당 원가 calculation. Lives in the 원가계산 sheet.
// Korean values match the user spec; legacy English values ("item"/"set")
// from older rows are normalized on read in services/costCalc.fromRow.
export type CostTargetType = "품목" | "세트";
export interface CostCalculation {
  id: string;
  targetType: CostTargetType;
  targetCode: string;     // itemNo or set optionCode/id
  itemNo: string;         // when targetType="item", same as targetCode
  materialCost: number;   // per-unit material cost
  packagingCost: number;  // per-unit packaging cost
  laborCost: number;      // per-unit labor cost
  overheadCost: number;   // per-unit overhead (제조간접비)
  defectRate: number;     // % (0–100)
  totalCost: number;      // final per-unit cost (with defect adjustment)
  calculatedAt: string;   // ISO datetime
  note: string;
}

// ─── Fragrance (향) ────────────────────────────────────────
// Separate domain from 품목 (Item). Produced fragrances are later upserted
// into 원료재고 with category "향료" so 품목BOM can reference them as a
// normal material.
export type FragranceProductType = "향료" | "케미컬 향료";
export const FRAGRANCE_PRODUCT_TYPES: FragranceProductType[] = ["향료", "케미컬 향료"];

export type FragranceType =
  | "시트러스" | "플로럴" | "우디" | "프루티" | "허벌"
  | "스파이시" | "머스크" | "파우더리" | "기타";
export const FRAGRANCE_TYPES: FragranceType[] = [
  "시트러스", "플로럴", "우디", "프루티", "허벌",
  "스파이시", "머스크", "파우더리", "기타",
];

export type FragranceStatus = "사용중" | "중단" | "테스트";
export const FRAGRANCE_STATUSES: FragranceStatus[] = ["사용중", "중단", "테스트"];

export interface Fragrance {
  id: string;
  fragranceCode: string;       // canonical key (also used as materialCode in 원료재고)
  fragranceName: string;
  productType: FragranceProductType;
  fragranceType: FragranceType;
  stock: number;               // ml
  unit: string;                // always "ml"
  safetyStock: number;
  status: FragranceStatus;
  note: string;
  createdAt: string;
}

export interface FragranceBomLine {
  id: string;
  fragranceCode: string;
  materialCode: string;
  materialName: string;
  category: MaterialCategory;
  qty: number;
  unit: string;
  note: string;
  createdAt: string;
}

export type FragranceInventoryStatus = "대기" | "사용가능" | "테스트" | "폐기";
export const FRAGRANCE_INVENTORY_STATUSES: FragranceInventoryStatus[] = ["대기", "사용가능", "테스트", "폐기"];

// New simplified production-state enum (per latest spec). Kept distinct
// from FragranceInventoryStatus so old data can stay readable and the new
// dropdown maps cleanly:
//   테스트 → no stock movement at all
//   완료   → normal — fragrance stock added, 원료재고 deducted
//   폐기   → fragrance stock REDUCED; 원료재고 NOT restored
export type FragranceLotStatus = "테스트" | "완료" | "폐기";
export const FRAGRANCE_LOT_STATUSES: FragranceLotStatus[] = ["테스트", "완료", "폐기"];

export interface FragranceLot {
  id: string;
  lotNo: string;
  fragranceCode: string;
  fragranceName: string;
  actualProducedQty: number;          // ml
  worker: string;
  productionDate: string;
  actualMaterialTotalCost: number;
  actualUnitCost: number;             // = actualMaterialTotalCost / actualProducedQty
  note: string;
  createdAt: string;
  // Inventory registration controls.
  //   registerToInventory=true  → 원료재고에 향료로 upsert + 원료입출고 입고 행 append
  //   registerToInventory=false → LOT/투입원료만 기록, 미등록 상태로 대기
  // inventoryStatus tracks the current lifecycle ("대기" / "사용가능" / "테스트" / "폐기").
  registerToInventory: boolean;
  inventoryStatus: FragranceInventoryStatus;
  // ─── New simplified production status + 2-step process tracking ─────
  // All optional/additive. When `status` is missing on legacy rows the UI
  // shows "(미지정)" rather than auto-defaulting to 완료.
  status?: FragranceLotStatus;
  mixingDate?: string;
  mixingWorker?: string;
  mixingNote?: string;
  scentTestDate?: string;
  scentTestWorker?: string;
  scentTestNote?: string;
  // ─── Disposal (폐기 처리) — non-destructive ─────────────────────────
  // 향마스터 / 원료재고(향료) stock is decremented exactly once. Raw
  // materials are NOT restored. Idempotent — once status="폐기" the
  // disposal action refuses to run again.
  disposalDate?: string;
  disposalQty?: number;
  disposalReason?: string;
  disposalWorker?: string;
}

export interface FragranceExecutionMaterial {
  id: string;
  lotNo: string;
  fragranceCode: string;
  materialCode: string;
  materialName: string;
  baseQty: number;          // BOM.qty snapshot
  multiplier: number;       // 작업배수
  baseTotalQty: number;     // = baseQty × multiplier
  adjustmentQty: number;    // user delta
  actualQty: number;        // = baseTotalQty + adjustmentQty
  unit: string;
  unitCost: number;         // material.unitCost at execution
  materialCost: number;     // = actualQty × unitCost
  createdAt: string;
}

// ─── Material in/out transactions ──────────────────────────
// Lives in the 원료입출고 sheet. Append-only history of material movements.
// Stock side-effects are applied by services/materialTransactions on save:
//   입고     → 원료재고.stock += qty
//   생산사용 → 원료재고.stock -= qty
//   폐기     → 원료재고.stock -= qty
//   재고조정 → 원료재고.stock += qty  (signed; user can enter a negative qty)
export type MaterialTransactionType = "입고" | "생산사용" | "폐기" | "재고조정";
export const MATERIAL_TRANSACTION_TYPES: MaterialTransactionType[] =
  ["입고", "생산사용", "폐기", "재고조정"];

export interface MaterialTransaction {
  id: string;
  transactionDate: string;        // 거래일 (YYYY-MM-DD)
  transactionType: MaterialTransactionType;
  materialCode: string;
  materialName: string;
  manufacturer: string;
  supplier: string;
  qty: number;
  unit: string;
  unitCost: number;
  capacity: string;               // 용량 (free-form e.g. "500ml")
  totalCost: number;
  lotNo: string;
  expiryDate: string;             // 유통기한 of this lot (sheet column, not item field)
  disposalReason: string;
  note: string;
  createdAt: string;              // ISO timestamp, stamped server-side
}

// ─── Equipment master (설비마스터) ─────────────────────────
// Backs the equipment dropdowns in 품목생산. Read-only from the production
// flow — selection writes the chosen string into mixingMachine /
// dispersionMachine / injectionMachine / qcEquipment as plain text.
export type EquipmentProcessType = "배합" | "분산" | "사출" | "QC" | "기타";
export const EQUIPMENT_PROCESS_TYPES: EquipmentProcessType[] = ["배합", "분산", "사출", "QC", "기타"];

export type EquipmentStatus = "활성" | "비활성";
export const EQUIPMENT_STATUSES: EquipmentStatus[] = ["활성", "비활성"];

export interface Equipment {
  id: string;
  equipmentName: string;
  processType: EquipmentProcessType;
  status: EquipmentStatus;
  location: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

// ─── BOM template ───────────────────────────────────────────
// A reusable set of base materials that can be applied to any itemNo's BOM.
// Lives in the BOM템플릿 sheet.
export interface BomTemplateLine {
  id: string;
  templateName: string;        // e.g. "오일파스텔 기본 베이스"
  productType: ProductType | "공통" | "";
  materialCode: string;
  materialName: string;
  category: MaterialCategory;
  qty: number;
  unit: string;
  note: string;
}
