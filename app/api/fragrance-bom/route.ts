import { NextResponse } from "next/server";
import {
  createFragranceBomLine,
  deleteFragranceBomLine,
  listFragranceBom,
  updateFragranceBomLine,
} from "@/services/fragranceBom";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.fragranceBom;

export async function GET() {
  return withErrorHandling("fragrance-bom GET", TAB, async () =>
    NextResponse.json({ data: await listFragranceBom() }));
}

export async function POST(req: Request) {
  const gate = requireRole("bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrance-bom POST", TAB, async () => {
    const body = await req.json();
    if (body.id) {
      const updated = await updateFragranceBomLine(body.id, body);
      return NextResponse.json({ data: updated });
    }
    const created = await createFragranceBomLine(body);
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrance-bom PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateFragranceBomLine(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}

export async function DELETE(req: Request) {
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrance-bom DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    const ok = await deleteFragranceBomLine(id);
    return NextResponse.json({ data: { ok } });
  });
}
