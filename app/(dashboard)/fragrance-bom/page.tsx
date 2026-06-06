import { listFragrances } from "@/services/fragrances";
import { listFragranceBom } from "@/services/fragranceBom";
import { listMaterials } from "@/services/materials";
import FragranceBomClient from "./FragranceBomClient";

export const dynamic = "force-dynamic";

export default async function FragranceBomPage() {
  const [fragrances, bom, materials] = await Promise.all([
    listFragrances(),
    listFragranceBom(),
    listMaterials(),
  ]);
  return (
    <FragranceBomClient
      initialBom={bom}
      fragrances={fragrances}
      materials={materials}
    />
  );
}
