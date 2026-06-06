import { listFragrances } from "@/services/fragrances";
import { listFragranceBom } from "@/services/fragranceBom";
import { listFragranceLots, listFragranceExecution } from "@/services/fragranceProduction";
import { listMaterials } from "@/services/materials";
import FragranceProductionClient from "./FragranceProductionClient";

export const dynamic = "force-dynamic";

export default async function FragranceProductionPage() {
  const [fragrances, bom, lots, exec, materials] = await Promise.all([
    listFragrances(),
    listFragranceBom(),
    listFragranceLots(),
    listFragranceExecution(),
    listMaterials(),
  ]);
  return (
    <FragranceProductionClient
      initialLots={lots}
      initialExec={exec}
      fragrances={fragrances}
      bom={bom}
      materials={materials}
    />
  );
}
