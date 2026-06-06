import { NextResponse } from "next/server";
import {
  createBomTemplateLine,
  createTemplateFromBom,
  deleteBomTemplateLine,
  duplicateTemplate,
  listBomTemplateLines,
  updateBomTemplateLine,
} from "@/services/bomTemplate";
import { listBomForItem } from "@/services/itemBom";
import { getItemByNo } from "@/services/items";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.bomTemplate;

export async function GET() {
  return withErrorHandling("bom-template GET", TAB, async () =>
    NextResponse.json({ data: await listBomTemplateLines() }));
}

export async function POST(req: Request) {
  const gate = requireRole("bom");
  if (!gate.ok) return gate.res;
  return withErrorHandling("bom-template POST", TAB, async () => {
    const body = await req.json();
    if (body.action === "duplicate") {
      const created = await duplicateTemplate(body.sourceName, body.newName);
      return NextResponse.json({ data: created });
    }
    if (body.action === "createFromBom") {
      const itemNo = String(body.itemNo ?? "");
      const templateName = String(body.templateName ?? "");
      if (!itemNo || !templateName) {
        return NextResponse.json(
          { ok: false, error: "itemNo와 templateName이 필요합니다." },
          { status: 400 },
        );
      }
      const [bom, item] = await Promise.all([
        listBomForItem(itemNo),
        getItemByNo(itemNo),
      ]);
      const created = await createTemplateFromBom({
        templateName,
        productType: item?.productType ?? "",
        rows: bom,
      });
      return NextResponse.json({ data: created });
    }
    if (body.id) {
      const updated = await updateBomTemplateLine(body.id, body);
      return NextResponse.json({ data: updated });
    }
    const created = await createBomTemplateLine(body);
    return NextResponse.json({ data: created });
  });
}

export async function DELETE(req: Request) {
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("bom-template DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    const ok = await deleteBomTemplateLine(id);
    return NextResponse.json({ data: { ok } });
  });
}
