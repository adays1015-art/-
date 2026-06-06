import { listBomTemplateLines } from "@/services/bomTemplate";
import { listMaterials } from "@/services/materials";
import BomTemplateClient from "./BomTemplateClient";

export const dynamic = "force-dynamic";

export default async function BomTemplatePage() {
  const [lines, materials] = await Promise.all([
    listBomTemplateLines(),
    listMaterials(),
  ]);
  return <BomTemplateClient initialLines={lines} materials={materials} />;
}
