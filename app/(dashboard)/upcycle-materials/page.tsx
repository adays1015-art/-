import { listMaterials } from "@/services/upcycleMaterials";
import { listExecutionMaterials } from "@/services/upcycleProductionExecution";
import UpcycleMaterialsClient from "./UpcycleMaterialsClient";

export const dynamic = "force-dynamic";

export default async function UpcycleMaterialsPage() {
  const [materials, productionUsage] = await Promise.all([
    listMaterials(),
    listExecutionMaterials(),
  ]);
  return (
    <UpcycleMaterialsClient
      initial={materials}
      initialProductionUsage={productionUsage}
    />
  );
}
