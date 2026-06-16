import { NextResponse } from "next/server";
import { createMaterial, listMaterials, updateMaterial } from "@/services/upcycleMaterials";
import { logWork } from "@/services/history";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.upcycleMaterials;

export async function GET() {
  return withErrorHandling("materials GET", TAB, async () =>
    NextResponse.json({ data: await listMaterials() }));
}

export async function POST(req: Request) {
  const gate = requireRole("upcycle-materials");
  if (!gate.ok) return gate.res;
  return withErrorHandling("materials POST", TAB, async () => {
    const body = await req.json();
    const created = await createMaterial(body);
    await logWork({
      type: "원료 입고", target: created.name,
      change: `+${created.stock}${created.unit}`,
      assignee: body.assignee ?? gate.role, note: created.note,
    });
    return NextResponse.json({ data: created });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("upcycle-materials");
  if (!gate.ok) return gate.res;
  return withErrorHandling("materials PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateMaterial(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await logWork({
      type: "수정", target: `원료 / ${updated.name}`,
      change: `재고 ${updated.stock}${updated.unit}`,
      assignee: body.assignee ?? gate.role, note: "",
    });
    return NextResponse.json({ data: updated });
  });
}
