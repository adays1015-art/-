import { listEquipment } from "@/services/equipment";
import EquipmentClient from "./EquipmentClient";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const equipment = await listEquipment();
  return <EquipmentClient initial={equipment} />;
}
