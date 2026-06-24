import { listDocuments } from "@/services/documents";
import DocumentsClient from "./DocumentsClient";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await listDocuments();
  return <DocumentsClient initial={documents} today={todayISO()} />;
}
