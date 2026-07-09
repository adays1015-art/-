import { listItemLots } from "@/services/upcycleProduction";
import { listItems } from "@/services/upcycleItems";
import { listBom } from "@/services/upcycleBom";
import { listMaterials } from "@/services/upcycleMaterials";
import { listMaterials as listMainMaterials } from "@/services/materials";
import { listExecutionMaterials } from "@/services/upcycleProductionExecution";
import { listEquipment } from "@/services/equipment";
import UpcycleProductionClient from "./UpcycleProductionClient";

export const dynamic = "force-dynamic";

export default async function UpcycleProductionPage() {
  const [lots, items, bom, upcycleMaterials, mainMaterials, executions, equipment] = await Promise.all([
    listItemLots(), listItems(), listBom(), listMaterials(), listMainMaterials(),
    listExecutionMaterials(), listEquipment(),
  ]);
  // 업사이클 BOM은 기존 원료도 구성품으로 가질 수 있으므로, 원가 계산이 그 단가를
  // 찾을 수 있게 업사이클 원료 + 기존 원료를 병합해서 넘긴다(업사이클 우선).
  const materials = [...upcycleMaterials, ...mainMaterials];
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
