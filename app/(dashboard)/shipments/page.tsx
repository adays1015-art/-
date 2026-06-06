import { listShipments } from "@/services/shipments";
import { listFinishedSets } from "@/services/finishedSets";
import { listClients } from "@/services/clients";
import ShipmentsClient from "./ShipmentsClient";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const [shipments, finished, clients] = await Promise.all([
    listShipments(), listFinishedSets(), listClients(),
  ]);
  return <ShipmentsClient initial={shipments} finished={finished} clients={clients} />;
}
