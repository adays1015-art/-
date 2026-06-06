import { NextResponse } from "next/server";
import {
  appendMaterialTransaction,
  listMaterialTransactions,
} from "@/services/materialTransactions";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.materialTransactions;

export async function GET() {
  return withErrorHandling("material-transactions GET", TAB, async () =>
    NextResponse.json({ data: await listMaterialTransactions() }));
}

export async function POST(req: Request) {
  const gate = requireRole("materials");
  if (!gate.ok) return gate.res;
  return withErrorHandling("material-transactions POST", TAB, async () => {
    const body = await req.json();
    const result = await appendMaterialTransaction({
      ...body,
      assignee: body.assignee ?? gate.role,
    });
    return NextResponse.json({ data: result.row, stockBefore: result.stockBefore, stockAfter: result.stockAfter, warning: result.warning });
  });
}
