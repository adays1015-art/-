import { NextResponse } from "next/server";
import {
  createSetAssemblyLot,
  listSetAssemblyLots,
  updateSetAssemblyLot,
} from "@/services/setAssembly";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.setAssemblyLots;

export async function GET() {
  return withErrorHandling("set-assembly GET", TAB, async () =>
    NextResponse.json({ data: await listSetAssemblyLots() }));
}

export async function POST(req: Request) {
  const gate = requireRole("set-assembly");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-assembly POST", TAB, async () => {
    const body = await req.json();
    const { lot, warning } = await createSetAssemblyLot(body);
    return NextResponse.json({ data: lot, warning });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("set-assembly");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-assembly PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateSetAssemblyLot(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
