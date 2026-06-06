import { NextResponse } from "next/server";
import { listCostItems, upsertCostItem } from "@/services/cost";
import { logWork } from "@/services/history";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.cost;

export async function GET() {
  return withErrorHandling("cost GET", TAB, async () =>
    NextResponse.json({ data: await listCostItems() }));
}

export async function POST(req: Request) {
  const gate = requireRole("cost");
  if (!gate.ok) return gate.res;
  return withErrorHandling("cost POST", TAB, async () => {
    const body = await req.json();
    const saved = await upsertCostItem(body);
    await logWork({
      type: "원가 수정", target: saved.name,
      change: `${saved.amount}${saved.unit} (${saved.basis})`,
      assignee: body.assignee ?? gate.role, note: "",
    });
    return NextResponse.json({ data: saved });
  });
}
