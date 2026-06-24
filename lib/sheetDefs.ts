/**
 * Canonical sheet definitions used by the "Google Sheets 초기화" button.
 *
 * Each entry: { sheetName, headers, description }
 *
 * This is the *user-specified* canonical schema. If a sheet doesn't exist
 * the initializer creates it with these headers; if a sheet exists with
 * data, the initializer leaves it untouched.
 *
 * NOTE: some headers here differ from what the live app currently writes.
 * The Apps Script handler auto-expands the header row when the app sends
 * a key that isn't yet a column, so writes still succeed (extra columns
 * just appear at the right edge).
 */

export interface SheetDef {
  sheetName: string;
  headers: string[];
  description: string;
}

// Re-export the schema-layer hidden-field filter so consumers can import
// everything schema-related from one place. Used by:
//   - services/csvSync.listTabs() (filters headers before exposing to UI)
//   - app/(dashboard)/schema/page.tsx
//   - app/(dashboard)/settings/sync/SyncClient.tsx
//   - any future schema-driven table/form generator
export {
  hiddenFieldsBySheet,
  filterHiddenColumns,
  visibleColumnsForSheet,
} from "@/lib/hiddenUIFields";

export const SHEET_DEFS: SheetDef[] = [
  {
    sheetName: "품목마스터",
    description: "각 품목번호의 마스터 정보 (제품유형 · 색상 · 향 · 재고)",
    headers: ["id", "itemNo", "productType", "colorName", "colorCode", "scentName", "scentCode", "status", "stock", "safetyStock", "unit", "productionUnit", "note"],
  },
  {
    sheetName: "원료재고",
    description: "원료 마스터 (안료/향료/왁스/바인더/패키지/스티커 등)",
    headers: ["id", "materialCode", "materialName", "category", "stock", "unit", "safetyStock", "unitCost", "costUnit", "supplier", "note"],
  },
  {
    sheetName: "품목BOM",
    description: "품목번호별 자재명세서 (1개당 사용량)",
    headers: ["id", "itemNo", "materialCode", "materialName", "qty", "unit", "note"],
  },
  {
    sheetName: "BOM템플릿",
    description: "공통 베이스 자재 묶음 — 품목BOM에 일괄 적용 가능",
    headers: ["id", "templateName", "productType", "materialCode", "materialName", "category", "qty", "unit", "note"],
  },
  {
    sheetName: "품목생산투입원료",
    description: "실 생산에 투입된 자재 (BOM 마스터를 변경하지 않고 실측치 기록, append-only). 헤더는 고정 — 누락 시 저장 거부.",
    headers: [
      "id", "lotNo", "itemNo", "materialCode", "materialName",
      "baseQty", "multiplier", "baseTotalQty", "adjustmentQty", "actualQty",
      "unit", "unitCost", "materialCost", "createdAt",
    ],
  },
  {
    sheetName: "원료입출고",
    description: "원료 입고/생산사용/폐기/재고조정 거래 이력 (append-only). 저장 시 원료재고 stock이 자동 조정됨.",
    headers: [
      "id", "transactionDate", "transactionType",
      "materialCode", "materialName", "manufacturer", "supplier",
      "qty", "unit", "unitCost", "capacity", "totalCost",
      "lotNo", "expiryDate", "disposalReason", "note", "createdAt",
    ],
  },
  {
    sheetName: "향마스터",
    description: "향(fragrance) 마스터. 생산된 향은 원료재고에 향료 카테고리로 upsert되어 품목BOM에서 일반 원료처럼 사용 가능.",
    headers: [
      "id", "fragranceCode", "fragranceName", "productType", "fragranceType",
      "stock", "unit", "safetyStock", "status", "note", "createdAt",
    ],
  },
  {
    sheetName: "향BOM",
    description: "향(fragranceCode)별 배합비. 향 생산 시 원료재고에서 차감되는 자재 명세.",
    headers: [
      "id", "fragranceCode", "materialCode", "materialName", "category",
      "qty", "unit", "note", "createdAt",
    ],
  },
  {
    sheetName: "향생산LOT",
    description: "향 생산 LOT 기록. registerToInventory=TRUE 시 원료재고로 향료 자동 등록. 미등록 LOT은 inventoryStatus=대기 상태로 보관됨.",
    headers: [
      "id", "lotNo", "fragranceCode", "fragranceName",
      "actualProducedQty", "worker", "productionDate",
      "actualMaterialTotalCost", "actualUnitCost", "note", "createdAt",
      "registerToInventory", "inventoryStatus",
    ],
  },
  {
    sheetName: "향생산투입원료",
    description: "향 생산 시 실 투입된 자재 (append-only).",
    headers: [
      "id", "lotNo", "fragranceCode", "materialCode", "materialName",
      "baseQty", "multiplier", "baseTotalQty", "adjustmentQty", "actualQty",
      "unit", "unitCost", "materialCost", "createdAt",
    ],
  },
  {
    sheetName: "품목생산LOT",
    description: "품목번호 단위 생산 LOT 기록 (실 생산 추적 컬럼 포함)",
    headers: [
      "id", "lotNo", "itemNo", "qty", "worker", "date", "status", "note",
      "actualProducedQty", "multiplier", "actualMaterialTotalCost", "actualUnitCost",
      "formulaModified", "formulaChangeMemo", "reworkFlag", "testProductionFlag",
    ],
  },
  {
    sheetName: "세트옵션",
    description: "판매용 세트 옵션 (거베라/플로럴/과실 등)",
    headers: ["id", "optionCode", "optionName", "qty", "note"],
  },
  {
    sheetName: "세트구성품목",
    description: "세트 옵션이 어떤 품목번호로 구성되는지",
    headers: ["id", "setOptionId", "itemNo", "order", "qty", "note"],
  },
  {
    sheetName: "세트조립LOT",
    description: "세트 단위 조립 LOT 기록",
    headers: ["id", "assemblyLotNo", "setOptionId", "qty", "worker", "date", "status", "note"],
  },
  {
    sheetName: "완제품세트재고",
    description: "조립이 완료된 판매 가능 세트 재고",
    headers: ["id", "setOptionId", "stock", "safetyStock", "note"],
  },
  {
    sheetName: "출고이력",
    description: "출고 기록 (품목/세트 단위)",
    headers: ["id", "shipmentNo", "target", "itemNo", "qty", "date", "manager", "note"],
  },
  {
    sheetName: "작업이력",
    description: "모든 운영 동작의 감사 로그",
    headers: ["id", "type", "targetId", "worker", "date", "note"],
  },
  {
    sheetName: "생산불량이력",
    description: "생산 시 발생한 불량 기록",
    headers: ["id", "itemNo", "qty", "reason", "date", "worker", "note"],
  },
  {
    sheetName: "원가설정",
    description: "원가 항목 (인건비/조립비/패키지비/수수료 등)",
    headers: ["id", "type", "targetCode", "cost", "note"],
  },
  {
    sheetName: "작업자통계",
    description: "작업자별 생산/불량 누적 통계",
    headers: ["id", "worker", "totalProduction", "totalDefect", "lastWorkDate", "note"],
  },
  {
    sheetName: "원가계산",
    description: "품목/세트별 원가 계산 스냅샷 (1개당 원가)",
    headers: ["id", "targetType", "targetCode", "itemNo", "materialCost", "packagingCost", "laborCost", "overheadCost", "defectRate", "totalCost", "calculatedAt", "note"],
  },

  // ─── 업사이클링 라인 (버려지는 화장품 재활용) — 기존 라인과 분리 ───
  {
    sheetName: "업사이클원료재고",
    description: "업사이클 전용 원재료 (버려지는 화장품 등)",
    headers: ["id", "materialCode", "materialName", "category", "stock", "unit", "safetyStock", "supplier", "unitPrice", "unitCost", "costUnit", "capacity", "inboundDate", "expiryDate", "msds", "note"],
  },
  {
    sheetName: "업사이클품목마스터",
    description: "업사이클 라인 전용 품목",
    headers: ["id", "itemNo", "productType", "colorName", "colorCode", "scentName", "scentCode", "status", "stock", "safetyStock", "unit", "productionUnit", "note"],
  },
  {
    sheetName: "업사이클BOM",
    description: "업사이클 품목별 자재명세서",
    headers: ["id", "itemNo", "materialId", "materialCode", "materialName", "materialCategory", "amountPerUnit", "qty", "unit", "note"],
  },
  {
    sheetName: "업사이클생산LOT",
    description: "업사이클 생산 LOT 기록 (실 생산 추적 컬럼 포함)",
    headers: [
      "id", "date", "itemNo", "productType", "lotCode", "targetQty", "completedQty", "defectQty",
      "assignee", "status", "note", "actualProducedQty", "multiplier", "actualMaterialTotalCost", "actualUnitCost",
      "mixingDate", "mixingWorker", "dispersionDate", "dispersionWorker", "injectionDate", "injectionWorker",
      "qcDate", "qcWorker", "mixingMachine", "dispersionMachine", "injectionMachine", "qcEquipment",
      "disposalDate", "disposalQty", "disposalReason", "disposalWorker",
    ],
  },
  {
    sheetName: "업사이클생산투입원료",
    description: "업사이클 생산 LOT별 실제 투입 원료 기록",
    headers: ["id", "lotNo", "itemNo", "materialCode", "materialName", "baseQty", "multiplier", "baseTotalQty", "adjustmentQty", "actualQty", "unit", "unitCost", "materialCost", "createdAt"],
  },
  {
    sheetName: "거래문서",
    description: "견적서 · 거래명세서 · 인보이스 · 발주서 보관. docType 으로 구분, 품목은 itemsJson 에 JSON 저장",
    headers: [
      "id", "docType", "docNo", "issueDate", "status",
      "clientId", "clientName", "clientBizNo", "clientContact", "clientPhone", "clientAddress",
      "currency", "taxMode", "taxRate", "itemsJson",
      "subtotal", "tax", "total", "note", "createdAt", "updatedAt",
    ],
  },
];
