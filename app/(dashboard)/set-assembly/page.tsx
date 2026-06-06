import { listSetAssemblyLots } from "@/services/setAssembly";
import { listSetComposition, listSetOptions } from "@/services/setOptions";
import { listItems } from "@/services/items";
import SetAssemblyClient from "./SetAssemblyClient";

export const dynamic = "force-dynamic";

export default async function SetAssemblyPage() {
  const [lots, opts, comps, items] = await Promise.all([
    listSetAssemblyLots(), listSetOptions(), listSetComposition(), listItems(),
  ]);
  return <SetAssemblyClient initial={lots} options={opts} composition={comps} items={items} />;
}
