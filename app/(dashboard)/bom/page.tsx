import { listBom } from "@/services/itemBom";
import { listItems } from "@/services/items";
import { listMaterials } from "@/services/materials";
import { listTemplateNames } from "@/services/bomTemplate";
import BomClient from "./BomClient";

export const dynamic = "force-dynamic";

export default async function BomPage() {
  const [bom, items, materials, templateNames] = await Promise.all([
    listBom(), listItems(), listMaterials(), listTemplateNames(),
  ]);
  return (
    <BomClient
      initialBom={bom}
      items={items}
      materials={materials}
      templateNames={templateNames}
    />
  );
}
