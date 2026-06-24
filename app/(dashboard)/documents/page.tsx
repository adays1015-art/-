import { listDocuments } from "@/services/documents";
import { listClients } from "@/services/clients";
import { listItems } from "@/services/items";
import DocumentsClient from "./DocumentsClient";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [documents, clients, items] = await Promise.all([
    listDocuments(),
    listClients(),
    listItems(),
  ]);
  return (
    <DocumentsClient
      initial={documents}
      clients={clients}
      items={items}
    />
  );
}
