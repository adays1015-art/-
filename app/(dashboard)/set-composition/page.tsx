import { listSetComposition, listSetOptions } from "@/services/setOptions";
import { listItems } from "@/services/items";
import { listMaterials } from "@/services/materials";
import SetCompositionClient from "./SetCompositionClient";

export const dynamic = "force-dynamic";

export default async function SetCompositionPage({ searchParams }: { searchParams: { option?: string } }) {
  const [opts, comps, items, materials] = await Promise.all([
    listSetOptions(), listSetComposition(), listItems(), listMaterials(),
  ]);
  return (
    <SetCompositionClient
      initialComposition={comps}
      options={opts}
      items={items}
      materials={materials}
      initialOptionId={searchParams.option ?? null}
    />
  );
}
