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
import AdminGate from "@/components/AdminGate";
import CostClient from "./CostClient";

export const dynamic = "force-dynamic";

export default async function CostPage() {
  const [cost, costCalcs, items, bom, materials, opts, comps, setBom, itemLots, executions, fragranceLots, fragranceExec] = await Promise.all([
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
  ]);
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
      />
    </AdminGate>
  );
}
