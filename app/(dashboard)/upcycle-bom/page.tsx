import { listBom } from "@/services/upcycleBom";
import { listItems } from "@/services/upcycleItems";
import { listMaterials } from "@/services/upcycleMaterials";
import { listTemplateNames } from "@/services/bomTemplate";
import UpcycleBomClient from "./UpcycleBomClient";

export const dynamic = "force-dynamic";

export default async function UpcycleBomPage() {
  const [bom, items, materials, templateNames] = await Promise.all([
    listBom(), listItems(), listMaterials(), listTemplateNames(),
  ]);
  return (
    <UpcycleBomClient
      initialBom={bom}
      items={items}
      materials={materials}
      templateNames={templateNames}
    />
  );
}
