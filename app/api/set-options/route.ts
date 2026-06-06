import { NextResponse } from "next/server";
import { createSetOption, listSetOptions, updateSetOption } from "@/services/setOptions";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.setOptions;

export async function GET() {
  return withErrorHandling("set-options GET", TAB, async () =>
    NextResponse.json({ data: await listSetOptions() }));
}

export async function POST(req: Request) {
  const gate = requireRole("set-options");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-options POST", TAB, async () => {
    const body = await req.json();
    return NextResponse.json({ data: await createSetOption(body) });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("set-options");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-options PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateSetOption(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
