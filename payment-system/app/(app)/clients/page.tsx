import { listClients } from "@/services/clients";
import { listCharges } from "@/services/charges";
import ClientsClient from "./ClientsClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, charges] = await Promise.all([listClients(), listCharges()]);
  return <ClientsClient initial={clients} charges={charges} />;
}
