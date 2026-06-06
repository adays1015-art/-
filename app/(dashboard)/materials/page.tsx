import { listMaterials } from "@/services/materials";
import { listMaterialTransactions } from "@/services/materialTransactions";
import { listExecutionMaterials } from "@/services/productionExecution";
import { listFragranceExecution } from "@/services/fragranceProduction";
import MaterialsClient from "./MaterialsClient";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const [materials, transactions, productionUsage, fragranceUsage] = await Promise.all([
    listMaterials(),
    listMaterialTransactions(),
    listExecutionMaterials(),
    listFragranceExecution(),
  ]);
  return (
    <MaterialsClient
      initial={materials}
      initialTransactions={transactions}
      initialProductionUsage={productionUsage}
      initialFragranceUsage={fragranceUsage}
    />
  );
}
