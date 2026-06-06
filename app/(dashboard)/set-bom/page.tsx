import { listSetBom } from "@/services/setBom";
import { listSetOptions } from "@/services/setOptions";
import { listMaterials } from "@/services/materials";
import SetBomClient from "./SetBomClient";

export const dynamic = "force-dynamic";

// 세트 BOM 전용 관리/조회 화면. 원가계산 화면과 분리.
// 세트옵션(시트) 의 옵션을 픽업하고, 원료재고(시트) 에서 구성품을 추가합니다.
export default async function SetBomPage() {
  const [setBom, setOptions, materials] = await Promise.all([
    listSetBom(),
    listSetOptions(),
    listMaterials(),
  ]);
  return (
    <SetBomClient
      setBom={setBom}
      setOptions={setOptions}
      materials={materials}
    />
  );
}
