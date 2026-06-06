import { listItems } from "@/services/items";
import ItemsClient from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  return <ItemsClient initial={await listItems()} />;
}
