import { listFragrances } from "@/services/fragrances";
import FragrancesClient from "./FragrancesClient";

export const dynamic = "force-dynamic";

export default async function FragrancesPage() {
  const fragrances = await listFragrances();
  return <FragrancesClient initial={fragrances} />;
}
