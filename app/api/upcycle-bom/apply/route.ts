import { NextResponse } from "next/server";
import { applyTemplateToItem } from "@/services/upcycleBom";
import { logWork } from "@/services/history";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.upcycleBom;

export async function POST(req: Request) {
  const gate = requireRole("upcycle-bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("upcycle-bom apply POST", TAB, async () => {
    const body = await req.json();
    const itemNo = String(body.itemNo ?? "");
    const templateName = String(body.templateName ?? "");
    const mode: "append" | "overwrite" = body.mode === "overwrite" ? "overwrite" : "append";
    if (!itemNo || !templateName) {
      return NextResponse.json({ ok: false, error: "itemNo와 templateName이 필요합니다." }, { status: 400 });
    }
    const result = await applyTemplateToItem({ itemNo, templateName, mode });
    await logWork({
      type: "수정",
      target: `업사이클BOM(${itemNo}) ⇐ 템플릿 ${templateName}`,
      change: `${result.effectiveMode} · 추가 ${result.created.length}건, 건너뜀 ${result.skipped.length}건`,
      assignee: body.assignee ?? gate.role,
      note: result.warning ?? "",
    });
    return NextResponse.json({ data: result });
  });
}
