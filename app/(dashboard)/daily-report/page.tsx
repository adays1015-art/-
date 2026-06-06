import AdminGate from "@/components/AdminGate";
import { listItemLots } from "@/services/itemProduction";
import { listFragranceLots, listFragranceExecution } from "@/services/fragranceProduction";
import { listMaterials } from "@/services/materials";
import { listItems } from "@/services/items";
import { listShipments } from "@/services/shipments";
import { listExecutionMaterials } from "@/services/productionExecution";
import { listMaterialTransactions } from "@/services/materialTransactions";
import DailyReportClient from "./DailyReportClient";

export const dynamic = "force-dynamic";

export default async function DailyReportPage() {
  const [
    itemLots, fragranceLots, fragranceExec,
    materials, items, shipments, execution, transactions,
  ] = await Promise.all([
    listItemLots(),
    listFragranceLots(),
    listFragranceExecution(),
    listMaterials(),
    listItems(),
    listShipments(),
    listExecutionMaterials(),
    listMaterialTransactions(),
  ]);
  return (
    <AdminGate>
      <DailyReportClient
        itemLots={itemLots}
        fragranceLots={fragranceLots}
        fragranceExec={fragranceExec}
        materials={materials}
        items={items}
        shipments={shipments}
        execution={execution}
        transactions={transactions}
      />
    </AdminGate>
  );
}
