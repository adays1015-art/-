import { NextResponse } from "next/server";
import { createBomLine, deleteBomLine, listBom, listBomForItem, updateBomLine } from "@/services/upcycleBom";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.upcycleBom;

export async function GET(req: Request) {
  return withErrorHandling("bom GET", TAB, async () => {
    const url = new URL(req.url);
    const itemNo = url.searchParams.get("itemNo");
    const data = itemNo ? await listBomForItem(itemNo) : await listBom();
    return NextResponse.json({ data });
  });
}

export async function POST(req: Request) {
  const gate = requireRole("upcycle-bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("bom POST", TAB, async () => {
    const body = await req.json();
    const created = await createBomLine(body);
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("upcycle-bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("bom PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateBomLine(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}

export async function DELETE(req: Request) {
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("bom DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteBomLine(id);
    return NextResponse.json({ ok });
  });
}
