import { listBom } from "@/services/upcycleBom";
import { listItems } from "@/services/upcycleItems";
import { listMaterials } from "@/services/upcycleMaterials";
import { listMaterials as listMainMaterials } from "@/services/materials";
import { listTemplateNames } from "@/services/bomTemplate";
import UpcycleBomClient from "./UpcycleBomClient";

export const dynamic = "force-dynamic";

export default async function UpcycleBomPage() {
  const [bom, items, upcycleMaterials, mainMaterials, templateNames] = await Promise.all([
    listBom(), listItems(), listMaterials(), listMainMaterials(), listTemplateNames(),
  ]);
  // 업사이클 BOM 선택지 = 업사이클 원료 + 기존 원료재고 (출처 태깅).
  // 업사이클을 먼저 두어 동일 코드 충돌 시 업사이클이 우선 매칭되게 한다.
  const materials = [
    ...upcycleMaterials.map((m) => ({ ...m, source: "업사이클" as const })),
    ...mainMaterials.map((m) => ({ ...m, source: "기존" as const })),
  ];
  return (
    <UpcycleBomClient
      initialBom={bom}
      items={items}
      materials={materials}
      templateNames={templateNames}
    />
  );
}
