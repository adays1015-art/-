import { getCompany } from "@/services/company";
import CompanyClient from "./CompanyClient";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const company = await getCompany();
  return <CompanyClient initial={company} />;
}
