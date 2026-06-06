import { listItemLots } from "@/services/itemProduction";
import { listItems } from "@/services/items";
import { listBom } from "@/services/itemBom";
import { listMaterials } from "@/services/materials";
import { listExecutionMaterials } from "@/services/productionExecution";
import { listEquipment } from "@/services/equipment";
import ItemProductionClient from "./ItemProductionClient";

export const dynamic = "force-dynamic";

export default async function ItemProductionPage() {
  const [lots, items, bom, materials, executions, equipment] = await Promise.all([
    listItemLots(), listItems(), listBom(), listMaterials(),
    listExecutionMaterials(), listEquipment(),
  ]);
  return (
    <ItemProductionClient
      initial={lots}
      items={items}
      bom={bom}
      materials={materials}
      executions={executions}
      equipment={equipment}
    />
  );
}
