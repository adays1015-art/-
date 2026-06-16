import { listItems } from "@/services/upcycleItems";
import UpcycleItemsClient from "./UpcycleItemsClient";

export const dynamic = "force-dynamic";

export default async function UpcycleItemsPage() {
  return <UpcycleItemsClient initial={await listItems()} />;
}
