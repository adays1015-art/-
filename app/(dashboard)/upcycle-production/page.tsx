import { listItemLots } from "@/services/upcycleProduction";
import { listItems } from "@/services/upcycleItems";
import { listBom } from "@/services/upcycleBom";
import { listMaterials } from "@/services/upcycleMaterials";
import { listExecutionMaterials } from "@/services/upcycleProductionExecution";
import { listEquipment } from "@/services/equipment";
import UpcycleProductionClient from "./UpcycleProductionClient";

export const dynamic = "force-dynamic";

export default async function UpcycleProductionPage() {
  const [lots, items, bom, materials, executions, equipment] = await Promise.all([
    listItemLots(), listItems(), listBom(), listMaterials(),
    listExecutionMaterials(), listEquipment(),
  ]);
  return (
    <UpcycleProductionClient
      initial={lots}
      items={items}
      bom={bom}
      materials={materials}
      executions={executions}
      equipment={equipment}
    />
  );
}
