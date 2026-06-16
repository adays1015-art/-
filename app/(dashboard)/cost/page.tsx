import { listCostItems } from "@/services/cost";
import { listCostCalculations } from "@/services/costCalc";
import { listItems } from "@/services/items";
import { listBom } from "@/services/itemBom";
import { listMaterials } from "@/services/materials";
import { listSetOptions, listSetComposition } from "@/services/setOptions";
import { listSetBom } from "@/services/setBom";
import { listItemLots } from "@/services/itemProduction";
import { listExecutionMaterials } from "@/services/productionExecution";
import { listFragranceLots, listFragranceExecution } from "@/services/fragranceProduction";
import { listItems as listUpcycleItems } from "@/services/upcycleItems";
import { listBom as listUpcycleBom } from "@/services/upcycleBom";
import { listItemLots as listUpcycleLots } from "@/services/upcycleProduction";
import { listMaterials as listUpcycleMaterials } from "@/services/upcycleMaterials";
import { listExecutionMaterials as listUpcycleExec } from "@/services/upcycleProductionExecution";
import AdminGate from "@/components/AdminGate";
import CostClient from "./CostClient";

export const dynamic = "force-dynamic";

export default async function CostPage() {
  const [
    cost, costCalcs, items, bom, materials, opts, comps, setBom, itemLots, executions, fragranceLots, fragranceExec,
    upcycleItems, upcycleBom, upcycleLots, upcycleMats, upcycleExec,
  ] = await Promise.all([
    listCostItems(),
    listCostCalculations(),
    listItems(),
    listBom(),
    listMaterials(),
    listSetOptions(),
    listSetComposition(),
    listSetBom(),
    listItemLots(),
    listExecutionMaterials(),
    listFragranceLots(),
    listFragranceExecution(),
    listUpcycleItems(),
    listUpcycleBom(),
    listUpcycleLots(),
    listUpcycleMaterials(),
    listUpcycleExec(),
  ]);
  // 업사이클 BOM은 기존 원료재고도 참조할 수 있으므로 원가 조회용 원료는 병합.
  const upcycleMaterialsMerged = [...upcycleMats, ...materials];
  return (
    <AdminGate>
      <CostClient
        initial={cost}
        initialCalculations={costCalcs}
        items={items}
        bom={bom}
        materials={materials}
        setOptions={opts}
        setComposition={comps}
        setBom={setBom}
        itemLots={itemLots}
        executionMaterials={executions}
        fragranceLots={fragranceLots}
        fragranceExec={fragranceExec}
        upcycleItems={upcycleItems}
        upcycleBom={upcycleBom}
        upcycleLots={upcycleLots}
        upcycleMaterials={upcycleMaterialsMerged}
        upcycleExec={upcycleExec}
      />
    </AdminGate>
  );
}
