import { NextResponse } from "next/server";
import { createEquipment, listEquipment, updateEquipment } from "@/services/equipment";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.equipment;

export async function GET() {
  return withErrorHandling("equipment GET", TAB, async () =>
    NextResponse.json({ data: await listEquipment() }));
}

export async function POST(req: Request) {
  // Equipment is a master record — same permission bucket as item master.
  const gate = requireRole("items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("equipment POST", TAB, async () => {
    const body = await req.json();
    const created = await createEquipment(body);
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("equipment PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateEquipment(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
