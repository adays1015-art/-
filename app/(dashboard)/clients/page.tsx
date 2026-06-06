import { listClients } from "@/services/clients";
import { listShipments } from "@/services/shipments";
import ClientsClient from "./ClientsClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, shipments] = await Promise.all([
    listClients(),
    listShipments(),
  ]);
  return <ClientsClient initialClients={clients} shipments={shipments} />;
}
