import { NextResponse } from "next/server";
import { createShipment, listShipments } from "@/services/shipments";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.shipments;

export async function GET() {
  return withErrorHandling("shipments GET", TAB, async () =>
    NextResponse.json({ data: await listShipments() }));
}

export async function POST(req: Request) {
  const gate = requireRole("shipment");
  if (!gate.ok) return gate.res;
  return withErrorHandling("shipments POST", TAB, async () => {
    const body = await req.json();
    const { shipment, warning } = await createShipment(body);
    return NextResponse.json({ data: shipment, warning });
  });
}
