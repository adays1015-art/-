import { listSetOptions, listSetComposition } from "@/services/setOptions";
import SetOptionsClient from "./SetOptionsClient";

export const dynamic = "force-dynamic";

export default async function SetOptionsPage() {
  const [opts, comps] = await Promise.all([listSetOptions(), listSetComposition()]);
  return <SetOptionsClient initial={opts} composition={comps} />;
}
