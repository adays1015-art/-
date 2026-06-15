/**
 * CSV-based manual sync between the in-memory store and Google Sheets.
 *
 * Provides a single TAB_DEFS registry so the /sync UI and API can iterate
 * uniformly. Each entry knows:
 *   - the sheet tab name (Korean, matches Google Sheets)
 *   - the column header order
 *   - how to serialize an in-memory row to a CSV row (toRow)
 *   - how to parse a CSV row back into the typed shape (fromRow)
 *   - how to read/write the store array for that entity
 *
 * This is intentionally separate from services/*.ts so each service stays
 * focused on its own CRUD; the converters here mirror the same shape.
 */

import { SHEET_TABS, type SheetTabKey } from "@/lib/googleSheets";
import { filterHiddenColumns } from "@/lib/hiddenUIFields";
import { getStore } from "./store";
import type {
  Material, MaterialCategory,
  Item, ItemStatus, ProductType,
  ItemBomLine,
  ItemLot, LotStatus,
  SetOption, SetSize,
  SetComposition,
  SetAssemblyLot,
  FinishedSet,
  Shipment,
  WorkLog, WorkLogType,
  CostItem,
  CostCalculation, CostTargetType,
  BomTemplateLine,
  ProductionExecutionMaterial,
  MaterialTransaction, MaterialTransactionType,
  Fragrance, FragranceProductType, FragranceType, FragranceStatus,
  FragranceBomLine,
  FragranceLot,
  FragranceExecutionMaterial,
} from "@/types";

function boolToCell(b: boolean): string { return b ? "TRUE" : "FALSE"; }
function cellToBool(s: string): boolean { return String(s).trim().toUpperCase() === "TRUE"; }
function num(s: string): number { const n = Number(s); return Number.isFinite(n) ? n : 0; }

export type Cell = string | number | boolean;

export interface TabDef<T> {
  key: SheetTabKey;
  tabName: string;             // 시트 탭 이름 (Korean)
  headers: string[];
  toRow(item: T): Cell[];
  fromRow(row: Record<string, string>): T;
  read(): T[];
  replace(rows: T[]): void;
}

// ─── Materials ──────────────────────────────────────────────
const materialsDef: TabDef<Material> = {
  key: "materials",
  tabName: SHEET_TABS.materials,
  headers: ["id","name","category","stock","unit","safetyStock","supplier","unitPrice","inboundDate","expiryDate","msds","note"],
  toRow: (m) => [m.id, m.name, m.category, m.stock, m.unit, m.safetyStock, m.supplier, m.unitPrice, m.inboundDate, m.expiryDate, boolToCell(m.msds), m.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    name: r.name ?? "",
    category: (r.category as MaterialCategory) ?? "기타",
    stock: num(r.stock),
    unit: r.unit ?? "",
    safetyStock: num(r.safetyStock),
    supplier: r.supplier ?? "",
    unitPrice: num(r.unitPrice),
    inboundDate: r.inboundDate ?? "",
    expiryDate: r.expiryDate ?? "",
    msds: cellToBool(r.msds),
    note: r.note ?? "",
  }),
  read: () => getStore().materials,
  replace: (rows) => { getStore().materials.splice(0, getStore().materials.length, ...rows); },
};

// ─── Items ──────────────────────────────────────────────────
const itemsDef: TabDef<Item> = {
  key: "items",
  tabName: SHEET_TABS.items,
  headers: ["id","itemNo","productType","colorName","colorCode","scentName","scentCode","status","stock","safetyStock","unit","productionUnit","note"],
  toRow: (i) => [i.id, i.itemNo, i.productType, i.colorName, i.colorCode, i.scentName, i.scentCode, i.status, i.stock, i.safetyStock, i.unit, i.productionUnit, i.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    itemNo: r.itemNo ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    colorName: r.colorName ?? "",
    colorCode: r.colorCode ?? "",
    scentName: r.scentName ?? "",
    scentCode: r.scentCode ?? "",
    status: (r.status as ItemStatus) ?? "사용중",
    stock: num(r.stock),
    safetyStock: num(r.safetyStock),
    unit: r.unit ?? "개",
    productionUnit: num(r.productionUnit) || 100,
    note: r.note ?? "",
  }),
  read: () => getStore().items,
  replace: (rows) => { getStore().items.splice(0, getStore().items.length, ...rows); },
};

// ─── Item BOM ───────────────────────────────────────────────
const bomDef: TabDef<ItemBomLine> = {
  key: "bom",
  tabName: SHEET_TABS.bom,
  headers: ["id","itemNo","materialId","materialName","materialCategory","amountPerUnit","unit","note"],
  toRow: (b) => [b.id, b.itemNo, b.materialId, b.materialName, b.materialCategory, b.amountPerUnit, b.unit, b.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    itemNo: r.itemNo ?? "",
    materialId: r.materialId ?? "",
    materialName: r.materialName ?? "",
    materialCategory: (r.materialCategory as MaterialCategory) ?? "기타",
    amountPerUnit: num(r.amountPerUnit),
    unit: r.unit ?? "",
    note: r.note ?? "",
  }),
  read: () => getStore().bom,
  replace: (rows) => { getStore().bom.splice(0, getStore().bom.length, ...rows); },
};

// ─── Item production lots ──────────────────────────────────
const itemLotsDef: TabDef<ItemLot> = {
  key: "itemLots",
  tabName: SHEET_TABS.itemLots,
  headers: ["id","date","itemNo","productType","lotCode","targetQty","completedQty","defectQty","assignee","status","note"],
  toRow: (l) => [l.id, l.date, l.itemNo, l.productType, l.lotCode, l.targetQty, l.completedQty, l.defectQty, l.assignee, l.status, l.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    date: r.date ?? "",
    itemNo: r.itemNo ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    lotCode: r.lotCode ?? "",
    targetQty: num(r.targetQty),
    completedQty: num(r.completedQty),
    defectQty: num(r.defectQty),
    assignee: r.assignee ?? "",
    status: (r.status as LotStatus) ?? "예정",
    note: r.note ?? "",
  }),
  read: () => getStore().itemLots,
  replace: (rows) => { getStore().itemLots.splice(0, getStore().itemLots.length, ...rows); },
};

// ─── Set options ───────────────────────────────────────────
const setOptionsDef: TabDef<SetOption> = {
  key: "setOptions",
  tabName: SHEET_TABS.setOptions,
  headers: ["id","productType","setSize","optionName","optionCode","isActive","note","salePrice","commissionRate"],
  toRow: (s) => [s.id, s.productType, s.setSize, s.optionName, s.optionCode, boolToCell(s.isActive), s.note, s.salePrice, s.commissionRate],
  fromRow: (r) => ({
    id: r.id ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    optionCode: r.optionCode ?? "",
    isActive: cellToBool(r.isActive),
    note: r.note ?? "",
    salePrice: Number(r.salePrice) || 0,
    commissionRate: Number(r.commissionRate) || 0,
  }),
  read: () => getStore().setOptions,
  replace: (rows) => { getStore().setOptions.splice(0, getStore().setOptions.length, ...rows); },
};

// ─── Set composition ───────────────────────────────────────
const setCompositionDef: TabDef<SetComposition> = {
  key: "setComposition",
  tabName: SHEET_TABS.setComposition,
  headers: ["id","setOptionId","itemNo","order","qty","note","componentType","componentCode","componentName"],
  toRow: (c) => [c.id, c.setOptionId, c.itemNo, c.order, c.qty, c.note,
    c.componentType ?? "", c.componentCode ?? "", c.componentName ?? ""],
  fromRow: (r) => {
    const rawType = (r.componentType ?? "").toLowerCase();
    const componentType: "item" | "material" | undefined =
      rawType === "material" ? "material" :
      rawType === "item" ? "item" : undefined;
    return {
      id: r.id ?? "",
      setOptionId: r.setOptionId ?? "",
      itemNo: r.itemNo ?? "",
      order: num(r.order),
      qty: num(r.qty),
      note: r.note ?? "",
      componentType,
      componentCode: r.componentCode ?? "",
      componentName: r.componentName ?? "",
    };
  },
  read: () => getStore().setComposition,
  replace: (rows) => { getStore().setComposition.splice(0, getStore().setComposition.length, ...rows); },
};

// ─── Set assembly lots ─────────────────────────────────────
const setAssemblyLotsDef: TabDef<SetAssemblyLot> = {
  key: "setAssemblyLots",
  tabName: SHEET_TABS.setAssemblyLots,
  headers: ["id","date","setOptionId","productType","setSize","optionName","qty","assignee","status","note"],
  toRow: (l) => [l.id, l.date, l.setOptionId, l.productType, l.setSize, l.optionName, l.qty, l.assignee, l.status, l.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    date: r.date ?? "",
    setOptionId: r.setOptionId ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    qty: num(r.qty),
    assignee: r.assignee ?? "",
    status: (r.status as LotStatus) ?? "예정",
    note: r.note ?? "",
  }),
  read: () => getStore().setAssemblyLots,
  replace: (rows) => { getStore().setAssemblyLots.splice(0, getStore().setAssemblyLots.length, ...rows); },
};

// ─── Finished sets ─────────────────────────────────────────
const finishedSetsDef: TabDef<FinishedSet> = {
  key: "finishedSets",
  tabName: SHEET_TABS.finishedSets,
  headers: ["id","productType","setSize","optionName","optionCode","stock","reserved","location","lastProducedAt"],
  toRow: (f) => [f.id, f.productType, f.setSize, f.optionName, f.optionCode, f.stock, f.reserved, f.location, f.lastProducedAt],
  fromRow: (r) => {
    const stock = num(r.stock);
    const reserved = num(r.reserved);
    return {
      id: r.id ?? "",
      productType: (r.productType as ProductType) ?? "오일파스텔",
      setSize: (r.setSize as SetSize) ?? "10색",
      optionName: r.optionName ?? "",
      optionCode: r.optionCode ?? "",
      stock,
      reserved,
      available: Math.max(0, stock - reserved),
      location: r.location ?? "",
      lastProducedAt: r.lastProducedAt ?? "",
    };
  },
  read: () => getStore().finishedSets,
  replace: (rows) => { getStore().finishedSets.splice(0, getStore().finishedSets.length, ...rows); },
};

// ─── Shipments ─────────────────────────────────────────────
const shipmentsDef: TabDef<Shipment> = {
  key: "shipments",
  tabName: SHEET_TABS.shipments,
  headers: ["id","date","productType","setSize","optionName","optionCode","qty","customer","assignee","note"],
  toRow: (s) => [s.id, s.date, s.productType, s.setSize, s.optionName, s.optionCode, s.qty, s.customer, s.assignee, s.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    date: r.date ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    optionCode: r.optionCode ?? "",
    qty: num(r.qty),
    customer: r.customer ?? "",
    assignee: r.assignee ?? "",
    note: r.note ?? "",
  }),
  read: () => getStore().shipments,
  replace: (rows) => { getStore().shipments.splice(0, getStore().shipments.length, ...rows); },
};

// ─── Work history ──────────────────────────────────────────
const historyDef: TabDef<WorkLog> = {
  key: "history",
  tabName: SHEET_TABS.history,
  headers: ["id","time","type","target","change","assignee","note"],
  toRow: (w) => [w.id, w.time, w.type, w.target, w.change, w.assignee, w.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    time: r.time ?? "",
    type: (r.type as WorkLogType) ?? "수정",
    target: r.target ?? "",
    change: r.change ?? "",
    assignee: r.assignee ?? "",
    note: r.note ?? "",
  }),
  read: () => getStore().history,
  replace: (rows) => { getStore().history.splice(0, getStore().history.length, ...rows); },
};

// ─── Cost items ────────────────────────────────────────────
const costDef: TabDef<CostItem> = {
  key: "cost",
  tabName: SHEET_TABS.cost,
  headers: ["id","name","amount","unit","basis","note"],
  toRow: (c) => [c.id, c.name, c.amount, c.unit, c.basis, c.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    name: r.name ?? "",
    amount: num(r.amount),
    unit: r.unit ?? "원",
    basis: r.basis ?? "",
    note: r.note ?? "",
  }),
  read: () => getStore().cost,
  replace: (rows) => { getStore().cost.splice(0, getStore().cost.length, ...rows); },
};

// ─── Cost calculations ─────────────────────────────────────
const costCalcDef: TabDef<CostCalculation> = {
  key: "costCalc",
  tabName: SHEET_TABS.costCalc,
  headers: ["id","targetType","targetCode","itemNo","materialCost","packagingCost","laborCost","overheadCost","defectRate","totalCost","calculatedAt","note"],
  toRow: (c) => [c.id, c.targetType, c.targetCode, c.itemNo, c.materialCost, c.packagingCost, c.laborCost, c.overheadCost, c.defectRate, c.totalCost, c.calculatedAt, c.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    targetType: ((r.targetType as CostTargetType) || "item"),
    targetCode: r.targetCode ?? "",
    itemNo: r.itemNo ?? "",
    materialCost: num(r.materialCost),
    packagingCost: num(r.packagingCost),
    laborCost: num(r.laborCost),
    overheadCost: num(r.overheadCost),
    defectRate: num(r.defectRate),
    totalCost: num(r.totalCost),
    calculatedAt: r.calculatedAt ?? "",
    note: r.note ?? "",
  }),
  read: () => (getStore().costCalc ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.costCalc) s.costCalc = [];
    s.costCalc.splice(0, s.costCalc.length, ...rows);
  },
};

// ─── BOM templates ─────────────────────────────────────────
const bomTemplateDef: TabDef<BomTemplateLine> = {
  key: "bomTemplate",
  tabName: SHEET_TABS.bomTemplate,
  headers: ["id","templateName","productType","materialCode","materialName","category","qty","unit","note"],
  toRow: (b) => [b.id, b.templateName, b.productType, b.materialCode, b.materialName, b.category, b.qty, b.unit, b.note],
  fromRow: (r) => ({
    id: r.id ?? "",
    templateName: r.templateName ?? "",
    productType: (r.productType as ProductType | "공통" | "") ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    category: (r.category as MaterialCategory) ?? "기타",
    qty: num(r.qty),
    unit: r.unit ?? "",
    note: r.note ?? "",
  }),
  read: () => (getStore().bomTemplate ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.bomTemplate) s.bomTemplate = [];
    s.bomTemplate.splice(0, s.bomTemplate.length, ...rows);
  },
};

// ─── Production execution materials ───────────────────────
const productionExecutionDef: TabDef<ProductionExecutionMaterial> = {
  key: "productionExecution",
  tabName: SHEET_TABS.productionExecution,
  headers: ["id","lotNo","itemNo","materialCode","materialName","baseQty","multiplier","baseTotalQty","adjustmentQty","actualQty","unit","unitCost","materialCost","createdAt"],
  toRow: (m) => [
    m.id, m.lotNo, m.itemNo, m.materialCode, m.materialName,
    m.baseQty, m.multiplier, m.baseTotalQty, m.adjustmentQty, m.actualQty,
    m.unit, m.unitCost, m.materialCost, m.createdAt,
  ],
  fromRow: (r) => {
    const base = num(r.baseQty);
    const mul = num(r.multiplier) || 1;
    const baseTotalRaw = (r.baseTotalQty ?? "").toString().trim();
    const baseTotalQty = baseTotalRaw !== "" ? num(r.baseTotalQty) : base * mul;
    const adj = num(r.adjustmentQty);
    const rawActual = (r.actualQty ?? "").toString().trim();
    const actualQty = rawActual !== "" ? num(r.actualQty) : baseTotalQty + adj;
    const unitCost = num(r.unitCost);
    const rawMatCost = (r.materialCost ?? "").toString().trim();
    const materialCost = rawMatCost !== "" ? num(r.materialCost) : actualQty * unitCost;
    return {
      id: r.id ?? "",
      lotId: r.lotId ?? "",
      lotNo: r.lotNo ?? "",
      itemNo: r.itemNo ?? "",
      materialCode: r.materialCode ?? "",
      materialName: r.materialName ?? "",
      baseQty: base,
      multiplier: mul,
      baseTotalQty,
      adjustmentQty: adj,
      actualQty,
      unit: r.unit ?? "",
      unitCost,
      materialCost,
      note: r.note ?? "",
      createdAt: r.createdAt ?? "",
    };
  },
  read: () => (getStore().productionExecution ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.productionExecution) s.productionExecution = [];
    s.productionExecution.splice(0, s.productionExecution.length, ...rows);
  },
};

// ─── Material in/out transactions ─────────────────────────
const materialTransactionsDef: TabDef<MaterialTransaction> = {
  key: "materialTransactions",
  tabName: SHEET_TABS.materialTransactions,
  headers: ["id","transactionDate","transactionType","materialCode","materialName","manufacturer","supplier","qty","unit","unitCost","capacity","totalCost","lotNo","expiryDate","disposalReason","note","createdAt"],
  toRow: (m) => [
    m.id, m.transactionDate, m.transactionType,
    m.materialCode, m.materialName, m.manufacturer, m.supplier,
    m.qty, m.unit, m.unitCost, m.capacity, m.totalCost,
    m.lotNo, m.expiryDate, m.disposalReason, m.note, m.createdAt,
  ],
  fromRow: (r) => ({
    id: r.id ?? "",
    transactionDate: r.transactionDate ?? "",
    transactionType: ((r.transactionType as MaterialTransactionType) || "입고"),
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    manufacturer: r.manufacturer ?? "",
    supplier: r.supplier ?? "",
    qty: num(r.qty),
    unit: r.unit ?? "",
    unitCost: num(r.unitCost),
    capacity: r.capacity ?? "",
    totalCost: num(r.totalCost),
    lotNo: r.lotNo ?? "",
    expiryDate: r.expiryDate ?? "",
    disposalReason: r.disposalReason ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  }),
  read: () => (getStore().materialTransactions ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.materialTransactions) s.materialTransactions = [];
    s.materialTransactions.splice(0, s.materialTransactions.length, ...rows);
  },
};

// ─── Fragrance master ─────────────────────────────────────
const fragrancesDef: TabDef<Fragrance> = {
  key: "fragrances",
  tabName: SHEET_TABS.fragrances,
  headers: ["id","fragranceCode","fragranceName","productType","fragranceType","stock","unit","safetyStock","status","note","createdAt"],
  toRow: (f) => [f.id, f.fragranceCode, f.fragranceName, f.productType, f.fragranceType, f.stock, f.unit, f.safetyStock, f.status, f.note, f.createdAt],
  fromRow: (r) => ({
    id: r.id ?? "",
    fragranceCode: r.fragranceCode ?? "",
    fragranceName: r.fragranceName ?? "",
    productType: ((r.productType as FragranceProductType) || "향료"),
    fragranceType: ((r.fragranceType as FragranceType) || "기타"),
    stock: num(r.stock),
    unit: r.unit || "ml",
    safetyStock: num(r.safetyStock) || 30,
    status: ((r.status as FragranceStatus) || "사용중"),
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  }),
  read: () => (getStore().fragrances ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.fragrances) s.fragrances = [];
    s.fragrances.splice(0, s.fragrances.length, ...rows);
  },
};

// ─── Fragrance BOM ────────────────────────────────────────
const fragranceBomDef: TabDef<FragranceBomLine> = {
  key: "fragranceBom",
  tabName: SHEET_TABS.fragranceBom,
  headers: ["id","fragranceCode","materialCode","materialName","category","qty","unit","note","createdAt"],
  toRow: (b) => [b.id, b.fragranceCode, b.materialCode, b.materialName, b.category, b.qty, b.unit, b.note, b.createdAt],
  fromRow: (r) => ({
    id: r.id ?? "",
    fragranceCode: r.fragranceCode ?? "",
    materialCode: r.materialCode ?? "",
    materialName: r.materialName ?? "",
    category: (r.category as MaterialCategory) ?? "기타",
    qty: num(r.qty),
    unit: r.unit ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
  }),
  read: () => (getStore().fragranceBom ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.fragranceBom) s.fragranceBom = [];
    s.fragranceBom.splice(0, s.fragranceBom.length, ...rows);
  },
};

// ─── Fragrance LOTs ───────────────────────────────────────
const fragranceLotsDef: TabDef<FragranceLot> = {
  key: "fragranceLots",
  tabName: SHEET_TABS.fragranceLots,
  headers: ["id","lotNo","fragranceCode","fragranceName","actualProducedQty","worker","productionDate","actualMaterialTotalCost","actualUnitCost","note","createdAt","registerToInventory","inventoryStatus"],
  toRow: (l) => [
    l.id, l.lotNo, l.fragranceCode, l.fragranceName,
    l.actualProducedQty, l.worker, l.productionDate,
    l.actualMaterialTotalCost, l.actualUnitCost, l.note, l.createdAt,
    l.registerToInventory ? "TRUE" : "FALSE", l.inventoryStatus,
  ],
  fromRow: (r) => {
    const rawReg = (r.registerToInventory ?? "").toString().trim().toUpperCase();
    const registerToInventory = rawReg === "" ? true : (rawReg === "TRUE" || rawReg === "1" || rawReg === "Y");
    const rawStatus = (r.inventoryStatus ?? "").toString().trim();
    const inventoryStatus = rawStatus === "대기" || rawStatus === "사용가능" || rawStatus === "테스트" || rawStatus === "폐기"
      ? (rawStatus as FragranceLot["inventoryStatus"])
      : (registerToInventory ? "사용가능" : "대기");
    return {
      id: r.id ?? "",
      lotNo: r.lotNo ?? "",
      fragranceCode: r.fragranceCode ?? "",
      fragranceName: r.fragranceName ?? "",
      actualProducedQty: num(r.actualProducedQty),
      worker: r.worker ?? "",
      productionDate: r.productionDate ?? "",
      actualMaterialTotalCost: num(r.actualMaterialTotalCost),
      actualUnitCost: num(r.actualUnitCost),
      note: r.note ?? "",
      createdAt: r.createdAt ?? "",
      registerToInventory,
      inventoryStatus,
    };
  },
  read: () => (getStore().fragranceLots ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.fragranceLots) s.fragranceLots = [];
    s.fragranceLots.splice(0, s.fragranceLots.length, ...rows);
  },
};

// ─── Fragrance execution materials ────────────────────────
const fragranceExecutionDef: TabDef<FragranceExecutionMaterial> = {
  key: "fragranceExecution",
  tabName: SHEET_TABS.fragranceExecution,
  headers: ["id","lotNo","fragranceCode","materialCode","materialName","baseQty","multiplier","baseTotalQty","adjustmentQty","actualQty","unit","unitCost","materialCost","createdAt"],
  toRow: (m) => [m.id, m.lotNo, m.fragranceCode, m.materialCode, m.materialName, m.baseQty, m.multiplier, m.baseTotalQty, m.adjustmentQty, m.actualQty, m.unit, m.unitCost, m.materialCost, m.createdAt],
  fromRow: (r) => {
    const base = num(r.baseQty);
    const mul = num(r.multiplier) || 1;
    const baseTotal = num(r.baseTotalQty) || base * mul;
    const adj = num(r.adjustmentQty);
    const actual = num(r.actualQty) || baseTotal + adj;
    const uc = num(r.unitCost);
    const mc = num(r.materialCost) || actual * uc;
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
  },
  read: () => (getStore().fragranceExecution ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.fragranceExecution) s.fragranceExecution = [];
    s.fragranceExecution.splice(0, s.fragranceExecution.length, ...rows);
  },
};

const equipmentDef: TabDef<import("@/types").Equipment> = {
  key: "equipment",
  tabName: SHEET_TABS.equipment,
  headers: ["id", "equipmentName", "processType", "status", "location", "note", "createdAt", "updatedAt"],
  toRow: (e) => [e.id, e.equipmentName, e.processType, e.status, e.location, e.note, e.createdAt, e.updatedAt],
  fromRow: (r) => ({
    id: r.id ?? "",
    equipmentName: r.equipmentName ?? "",
    processType: (r.processType as import("@/types").EquipmentProcessType) ?? "기타",
    status: (r.status as import("@/types").EquipmentStatus) ?? "활성",
    location: r.location ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  }),
  read: () => (getStore().equipment ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.equipment) s.equipment = [];
    s.equipment.splice(0, s.equipment.length, ...rows);
  },
};

const clientsDef: TabDef<import("@/types").Client> = {
  key: "clients",
  tabName: SHEET_TABS.clients,
  headers: [
    "id", "clientCode", "clientName", "contactName", "phone", "email",
    "country", "region", "address", "note", "status", "createdAt", "updatedAt",
    "unitPrice", "commissionRate",
  ],
  toRow: (c) => [
    c.id, c.clientCode, c.clientName, c.contactName, c.phone, c.email,
    c.country, c.region, c.address, c.note, c.status, c.createdAt, c.updatedAt,
    c.unitPrice, c.commissionRate,
  ],
  fromRow: (r) => ({
    id: r.id ?? "",
    clientCode: r.clientCode ?? "",
    clientName: r.clientName ?? "",
    contactName: r.contactName ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    country: r.country ?? "",
    region: r.region ?? "",
    address: r.address ?? "",
    note: r.note ?? "",
    status: (r.status as import("@/types").ClientStatus) ?? "활성",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
    unitPrice: Number(r.unitPrice) || 0,
    commissionRate: Number(r.commissionRate) || 0,
  }),
  read: () => (getStore().clients ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.clients) s.clients = [];
    s.clients.splice(0, s.clients.length, ...rows);
  },
};

const setBomDef: TabDef<import("@/types").SetBomLine> = {
  key: "setBom",
  tabName: SHEET_TABS.setBom,
  headers: [
    "id", "setCode", "setName", "componentType", "componentCode", "componentName",
    "qty", "unitCost", "unitCostSource", "note", "createdAt", "updatedAt",
  ],
  toRow: (b) => [
    b.id, b.setCode, b.setName, b.componentType, b.componentCode, b.componentName,
    b.qty, b.unitCost, b.unitCostSource, b.note, b.createdAt, b.updatedAt,
  ],
  fromRow: (r) => ({
    id: r.id ?? "",
    setCode: r.setCode ?? "",
    setName: r.setName ?? "",
    componentType: ((r.componentType as import("@/types").SetBomComponentType) ?? "item"),
    componentCode: r.componentCode ?? "",
    componentName: r.componentName ?? "",
    qty: Number(r.qty) || 0,
    unitCost: Number(r.unitCost) || 0,
    unitCostSource: r.unitCostSource ?? "",
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  }),
  read: () => (getStore().setBom ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.setBom) s.setBom = [];
    s.setBom.splice(0, s.setBom.length, ...rows);
  },
};

const weeklyReportsDef: TabDef<import("@/types").WeeklyReport> = {
  key: "weeklyReports",
  tabName: SHEET_TABS.weeklyReports,
  headers: [
    "id", "weekStart", "weekEnd", "author", "department",
    "thisWeek", "nextWeek", "issues", "note", "status", "createdAt", "updatedAt",
  ],
  toRow: (w) => [
    w.id, w.weekStart, w.weekEnd, w.author, w.department,
    w.thisWeek, w.nextWeek, w.issues, w.note, w.status, w.createdAt, w.updatedAt,
  ],
  fromRow: (r) => ({
    id: r.id ?? "",
    weekStart: r.weekStart ?? "",
    weekEnd: r.weekEnd ?? "",
    author: r.author ?? "",
    department: r.department ?? "",
    thisWeek: r.thisWeek ?? "",
    nextWeek: r.nextWeek ?? "",
    issues: r.issues ?? "",
    note: r.note ?? "",
    status: ((r.status as import("@/types").WeeklyReportStatus) ?? "작성중"),
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  }),
  read: () => (getStore().weeklyReports ?? []),
  replace: (rows) => {
    const s = getStore();
    if (!s.weeklyReports) s.weeklyReports = [];
    s.weeklyReports.splice(0, s.weeklyReports.length, ...rows);
  },
};

// ─── Registry ──────────────────────────────────────────────
export const TAB_DEFS: Record<SheetTabKey, TabDef<unknown>> = {
  materials: materialsDef as TabDef<unknown>,
  items: itemsDef as TabDef<unknown>,
  bom: bomDef as TabDef<unknown>,
  itemLots: itemLotsDef as TabDef<unknown>,
  setOptions: setOptionsDef as TabDef<unknown>,
  setComposition: setCompositionDef as TabDef<unknown>,
  setAssemblyLots: setAssemblyLotsDef as TabDef<unknown>,
  finishedSets: finishedSetsDef as TabDef<unknown>,
  shipments: shipmentsDef as TabDef<unknown>,
  history: historyDef as TabDef<unknown>,
  cost: costDef as TabDef<unknown>,
  costCalc: costCalcDef as TabDef<unknown>,
  bomTemplate: bomTemplateDef as TabDef<unknown>,
  productionExecution: productionExecutionDef as TabDef<unknown>,
  materialTransactions: materialTransactionsDef as TabDef<unknown>,
  fragrances: fragrancesDef as TabDef<unknown>,
  fragranceBom: fragranceBomDef as TabDef<unknown>,
  fragranceLots: fragranceLotsDef as TabDef<unknown>,
  fragranceExecution: fragranceExecutionDef as TabDef<unknown>,
  equipment: equipmentDef as TabDef<unknown>,
  setBom: setBomDef as TabDef<unknown>,
  clients: clientsDef as TabDef<unknown>,
  weeklyReports: weeklyReportsDef as TabDef<unknown>,
};

export function defByKey(key: string): TabDef<unknown> | null {
  return (TAB_DEFS as Record<string, TabDef<unknown>>)[key] ?? null;
}

export function defByTabName(tabName: string): TabDef<unknown> | null {
  for (const def of Object.values(TAB_DEFS)) {
    if (def.tabName === tabName) return def;
  }
  return null;
}

/**
 * UI-facing list of tabs. Headers are pre-filtered against the schema-layer
 * hidden-field set so any consumer that renders columns dynamically (탭별
 * 컬럼 구조, schema/page, future schema-driven tables/forms) automatically
 * excludes the hidden columns.
 *
 * CSV upload/download still uses each TabDef's raw `headers` directly, so
 * the full column set is preserved on the wire — only the UI surface is
 * filtered.
 */
export function listTabs(): Array<{ key: SheetTabKey; tabName: string; rowCount: number; headers: string[] }> {
  return Object.values(TAB_DEFS).map((d) => ({
    key: d.key,
    tabName: d.tabName,
    rowCount: d.read().length,
    headers: filterHiddenColumns(d.tabName, d.headers),
  }));
}
