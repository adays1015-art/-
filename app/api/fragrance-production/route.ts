import { NextResponse } from "next/server";
import {
  createFragranceLot,
  disposeFragranceLot,
  listFragranceExecution,
  listFragranceLots,
  registerLotToInventory,
} from "@/services/fragranceProduction";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.fragranceLots;

export async function GET() {
  return withErrorHandling("fragrance-production GET", TAB, async () => {
    const [lots, exec] = await Promise.all([
      listFragranceLots(),
      listFragranceExecution(),
    ]);
    return NextResponse.json({ data: { lots, exec } });
  });
}

export async function POST(req: Request) {
  const gate = requireRole("item-production");
  if (!gate.ok) return gate.res;
  return withErrorHandling("fragrance-production POST", TAB, async () => {
    const body = await req.json();
    // Branch: { action: "register", id } promotes a previously-skipped LOT
    // into 원료재고. Refuses duplicates (inventoryStatus !== "대기").
    if (body?.action === "register") {
      const result = await registerLotToInventory(String(body.id ?? ""), {
        assignee: body.assignee ?? gate.role,
      });
      return NextResponse.json({
        data: result.lot,
        material: result.material,
        createdMaterial: result.createdMaterial,
        warning: result.warning,
      });
    }
    if (body?.action === "dispose") {
      const result = await disposeFragranceLot(String(body.id ?? ""), {
        disposalDate:   String(body.disposalDate   ?? ""),
        disposalReason: String(body.disposalReason ?? ""),
        disposalWorker: String(body.disposalWorker ?? gate.role ?? ""),
        disposalQty:    body.disposalQty != null && body.disposalQty !== ""
          ? Number(body.disposalQty)
          : undefined,
      });
      return NextResponse.json({
        data: result.lot,
        reversedQty: result.reversedQty,
        warning: result.warning,
      });
    }
    const result = await createFragranceLot({
      ...body,
      assignee: body.assignee ?? gate.role,
    });
    return NextResponse.json({
      data: result.lot,
      material: result.material,
      createdMaterial: result.createdMaterial,
      warning: result.warning,
    });
  });
}
