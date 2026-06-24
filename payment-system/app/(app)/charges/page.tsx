import { listCharges } from "@/services/charges";
import { listClients } from "@/services/clients";
import ChargesClient from "./ChargesClient";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChargesPage() {
  const [charges, clients] = await Promise.all([listCharges(), listClients()]);
  return <ChargesClient initial={charges} clients={clients} today={todayISO()} />;
}
