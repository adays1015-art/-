import { NextResponse } from "next/server";
import {
  createFragrance,
  listFragrances,
  updateFragrance,
} from "@/services/fragrances";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.fragrances;

export async function GET() {
  return withErrorHandling("fragrances GET", TAB, async () =>
    NextResponse.json({ data: await listFragrances() }));
}

export async function POST(req: Request) {
  // Fragrance master is part of the items domain — reuse the "items" role gate.
  const gate = requireRole("items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrances POST", TAB, async () => {
    const body = await req.json();
    const created = await createFragrance(body);
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrances PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateFragrance(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
