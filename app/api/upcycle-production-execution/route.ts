import { NextResponse } from "next/server";
import {
  appendExecutionMaterials,
  listExecutionMaterials,
  listExecutionMaterialsByItem,
  listExecutionMaterialsByLot,
} from "@/services/upcycleProductionExecution";
import { logWork } from "@/services/history";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.upcycleExecution;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const itemNo = url.searchParams.get("itemNo");
  const lotId = url.searchParams.get("lotId");
  return withErrorHandling("production-execution GET", TAB, async () => {
    const data = lotId
      ? await listExecutionMaterialsByLot(lotId)
      : itemNo
        ? await listExecutionMaterialsByItem(itemNo)
        : await listExecutionMaterials();
    return NextResponse.json({ data });
  });
}

/**
 * Append rows for one production run. Body shape:
 *   { rows: [ { lotId?, itemNo, materialCode, materialName, baseQty, adjustmentQty, actualQty, unit, note? }, ... ] }
 *
 * Append-only — there is no PATCH or DELETE.
 */
export async function POST(req: Request) {
  const gate = requireRole("upcycle-production");
  if (!gate.ok) return gate.res;
  return withErrorHandling("production-execution POST", TAB, async () => {
    const body = await req.json();
    const inputs = Array.isArray(body?.rows) ? body.rows : [];
    if (inputs.length === 0) {
      return NextResponse.json({ ok: false, error: "rows[]는 비어 있을 수 없습니다." }, { status: 400 });
    }
    const created = await appendExecutionMaterials(inputs);
    const lotId = created[0]?.lotId || "(no-lot)";
    const itemNo = created[0]?.itemNo || "?";
    await logWork({
      type: "수정",
      target: `생산실행자재 ${itemNo}번 (lot ${lotId})`,
      change: `${created.length}종 자재 기록`,
      assignee: body.assignee ?? gate.role,
      note: body.note ?? "",
    });
    return NextResponse.json({ data: created });
  });
}
