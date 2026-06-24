import { listDocuments } from "@/services/documents";
import { getCompany } from "@/services/company";
import DocumentsClient from "./DocumentsClient";
import { todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [documents, company] = await Promise.all([listDocuments(), getCompany()]);
  return <DocumentsClient initial={documents} company={company} today={todayISO()} />;
}
