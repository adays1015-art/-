import { NextResponse } from "next/server";
import {
  createComposition,
  deleteComposition,
  listCompositionForOption,
  listSetComposition,
} from "@/services/setOptions";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.setComposition;

export async function GET(req: Request) {
  return withErrorHandling("set-composition GET", TAB, async () => {
    const url = new URL(req.url);
    const setOptionId = url.searchParams.get("setOptionId");
    const data = setOptionId ? await listCompositionForOption(setOptionId) : await listSetComposition();
    return NextResponse.json({ data });
  });
}

export async function POST(req: Request) {
  const gate = requireRole("set-options");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-composition POST", TAB, async () => {
    const body = await req.json();
    return NextResponse.json({ data: await createComposition(body) });
  });
}

export async function DELETE(req: Request) {
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("set-composition DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteComposition(id);
    return NextResponse.json({ ok });
  });
}
