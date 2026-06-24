/**
 * In-memory copy of the sample data used when Google Sheets credentials are
 * not configured. Mutations persist for the lifetime of the dev server process.
 */
import {
  sampleMaterials,
  sampleItems,
  sampleItemBom,
  sampleItemLots,
  sampleSetOptions,
  sampleSetComposition,
  sampleSetAssemblyLots,
  sampleFinishedSets,
  sampleShipments,
  sampleWorkLogs,
  sampleCostItems,
} from "@/data/sampleData";
import type {
  Material,
  Item,
  ItemBomLine,
  ItemLot,
  SetOption,
  SetComposition,
  SetAssemblyLot,
  FinishedSet,
  Shipment,
  WorkLog,
  CostItem,
  CostCalculation,
  BomTemplateLine,
  ProductionExecutionMaterial,
  MaterialTransaction,
  Fragrance,
  FragranceBomLine,
  FragranceLot,
  FragranceExecutionMaterial,
  Equipment,
  SetBomLine,
  Client,
  BusinessDocument,
  TestResult,
} from "@/types";

type Store = {
  materials: Material[];
  items: Item[];
  bom: ItemBomLine[];
  itemLots: ItemLot[];
  setOptions: SetOption[];
  setComposition: SetComposition[];
  setAssemblyLots: SetAssemblyLot[];
  finishedSets: FinishedSet[];
  shipments: Shipment[];
  history: WorkLog[];
  cost: CostItem[];
  costCalc?: CostCalculation[];
  bomTemplate?: BomTemplateLine[];
  productionExecution?: ProductionExecutionMaterial[];
  materialTransactions?: MaterialTransaction[];
  fragrances?: Fragrance[];
  fragranceBom?: FragranceBomLine[];
  fragranceLots?: FragranceLot[];
  fragranceExecution?: FragranceExecutionMaterial[];
  equipment?: Equipment[];
  setBom?: SetBomLine[];
  clients?: Client[];
  documents?: BusinessDocument[];
  // 업사이클링 라인 — 별도 데이터(기존 품목/원료와 분리)
  upcycleMaterials: Material[];
  upcycleItems: Item[];
  upcycleBom: ItemBomLine[];
  upcycleLots: ItemLot[];
  upcycleExecution?: ProductionExecutionMaterial[];
  testResults: TestResult[];
};

declare global {
  // eslint-disable-next-line no-var
  var __BFTER_STORE__: Store | undefined;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function getStore(): Store {
  if (!globalThis.__BFTER_STORE__) {
    globalThis.__BFTER_STORE__ = {
      materials: clone(sampleMaterials),
      items: clone(sampleItems),
      bom: clone(sampleItemBom),
      itemLots: clone(sampleItemLots),
      setOptions: clone(sampleSetOptions),
      setComposition: clone(sampleSetComposition),
      setAssemblyLots: clone(sampleSetAssemblyLots),
      finishedSets: clone(sampleFinishedSets),
      shipments: clone(sampleShipments),
      history: clone(sampleWorkLogs),
      cost: clone(sampleCostItems),
      costCalc: [],
      bomTemplate: [],
      productionExecution: [],
      materialTransactions: [],
      fragrances: [],
      fragranceBom: [],
      fragranceLots: [],
      fragranceExecution: [],
      equipment: [],
      setBom: [],
      clients: [],
      documents: [],
      upcycleMaterials: [],
      upcycleItems: [],
      upcycleBom: [],
      upcycleLots: [],
      upcycleExecution: [],
      testResults: [],
    };
  }
  return globalThis.__BFTER_STORE__;
}
