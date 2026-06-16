import { listShipments } from "@/services/shipments";
import { listFinishedSets } from "@/services/finishedSets";
import { listClients } from "@/services/clients";
import { listItems as listUpcycleItems } from "@/services/upcycleItems";
import ShipmentsClient from "./ShipmentsClient";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const [shipments, finished, clients, upcycleItems] = await Promise.all([
    listShipments(), listFinishedSets(), listClients(), listUpcycleItems(),
  ]);
  return (
    <ShipmentsClient
      initial={shipments}
      finished={finished}
      clients={clients}
      upcycleItems={upcycleItems}
    />
  );
}
