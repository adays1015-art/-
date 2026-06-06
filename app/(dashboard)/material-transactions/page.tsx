import { listMaterials } from "@/services/materials";
import { listMaterialTransactions } from "@/services/materialTransactions";
import MaterialTransactionsClient from "./MaterialTransactionsClient";

export const dynamic = "force-dynamic";

export default async function MaterialTransactionsPage() {
  const [transactions, materials] = await Promise.all([
    listMaterialTransactions(),
    listMaterials(),
  ]);
  return (
    <MaterialTransactionsClient
      initial={transactions}
      materials={materials}
    />
  );
}
