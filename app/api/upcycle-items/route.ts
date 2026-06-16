import { NextResponse } from "next/server";
import { createItem, listItems, updateItem } from "@/services/upcycleItems";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.upcycleItems;

export async function GET() {
  return withErrorHandling("items GET", TAB, async () =>
    NextResponse.json({ data: await listItems() }));
}

export async function POST(req: Request) {
  const gate = requireRole("upcycle-items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("items POST", TAB, async () => {
    const body = await req.json();
    const created = await createItem(body);
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("upcycle-items");
  if (!gate.ok) return gate.res;
  return withErrorHandling("items PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateItem(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
