import { NextResponse } from "next/server";
import { listCostCalculations, upsertCostCalculation } from "@/services/costCalc";
import { logWork } from "@/services/history";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.costCalc;

export async function GET() {
  return withErrorHandling("cost-calc GET", TAB, async () =>
    NextResponse.json({ data: await listCostCalculations() }));
}

export async function POST(req: Request) {
  const gate = requireRole("cost");
  if (!gate.ok) return gate.res;
  return withErrorHandling("cost-calc POST", TAB, async () => {
    const body = await req.json();
    const saved = await upsertCostCalculation(body);
    await logWork({
      type: "원가 수정",
      target: `${saved.targetType}:${saved.targetCode}`,
      change: `1개당 ${saved.totalCost.toLocaleString("ko-KR")}원 (불량률 ${saved.defectRate}%)`,
      assignee: body.assignee ?? gate.role,
      note: saved.note,
    });
    return NextResponse.json({ data: saved });
  });
}
