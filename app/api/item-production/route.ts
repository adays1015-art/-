import { NextResponse } from "next/server";
import { createItemLot, deleteItemLot, disposeItemLot, listItemLots, updateItemLot } from "@/services/itemProduction";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS, readRowsOrEmpty } from "@/lib/googleSheets";

const TAB = SHEET_TABS.itemLots;

// Names of the process-tracking columns that must exist in 품목생산LOT for
// dispersionDate / injectionDate / qcDate (+ worker fields) to persist.
const PROCESS_HEADERS = [
  "mixingDate", "mixingWorker",
  "dispersionDate", "dispersionWorker",
  "injectionDate", "injectionWorker",
  "qcDate", "qcWorker",
];
const EQUIPMENT_HEADERS = [
  "mixingMachine", "dispersionMachine", "injectionMachine", "qcEquipment",
];
const DISPOSAL_HEADERS = [
  "disposalDate", "disposalQty", "disposalReason", "disposalWorker",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "headers";
  return withErrorHandling("item-production GET", TAB, async () => {
    const lots = await listItemLots();
    if (!probe) return NextResponse.json({ data: lots });
    // Re-read raw rows (no fromRow projection) so we can see the actual
    // sheet column names. If the sheet has zero data rows we cannot probe
    // headers via this route — we return missing: null to indicate unknown.
    const raw = await readRowsOrEmpty<Record<string, string>>(TAB);
    let headers: { known: string[]; missing: string[] } | null = null;
    if (raw.length > 0) {
      const known = Object.keys(raw[0]);
      const missingProcess = PROCESS_HEADERS.filter((h) => !known.includes(h));
      const missingEquipment = EQUIPMENT_HEADERS.filter((h) => !known.includes(h));
      const missingDisposal = DISPOSAL_HEADERS.filter((h) => !known.includes(h));
      headers = {
        known,
        missing: missingProcess,
        missingEquipment,
        missingDisposal,
      } as {
        known: string[]; missing: string[];
        missingEquipment: string[]; missingDisposal: string[];
      };
    }
    return NextResponse.json({ data: lots, headers });
  });
}

export async function POST(req: Request) {
  const gate = requireRole("item-production");
  if (!gate.ok) return gate.res;
  return withErrorHandling("item-production POST", TAB, async () => {
    const body = await req.json();
    // Branch: { action: "dispose", id, disposalDate, disposalReason,
    //          disposalWorker, disposalQty? }
    // Non-destructive — reverses 품목재고, sets status="폐기", logs work.
    // Refuses to run twice on the same LOT.
    if (body?.action === "dispose") {
      const result = await disposeItemLot(String(body.id ?? ""), {
        disposalDate: String(body.disposalDate ?? ""),
        disposalReason: String(body.disposalReason ?? ""),
        disposalWorker: String(body.disposalWorker ?? gate.role ?? ""),
        disposalQty: body.disposalQty != null && body.disposalQty !== ""
          ? Number(body.disposalQty)
          : undefined,
      });
      return NextResponse.json({ data: result.lot, reversedQty: result.reversedQty });
    }
    const { lot, warning } = await createItemLot(body);
    return NextResponse.json({ data: lot, warning });
  });
}

export async function DELETE(req: Request) {
  // Use the broader delete permission so 생산팀 doesn't accidentally remove
  // scheduled LOTs without explicit approval.
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("item-production DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const result = await deleteItemLot(id);
    return NextResponse.json({ data: result.lot });
  });
}

export async function PATCH(req: Request) {
  const gate = requireRole("item-production");
  if (!gate.ok) return gate.res;
  return withErrorHandling("item-production PATCH", TAB, async () => {
    const body = await req.json();
    const { id, ...patch } = body;
    const updated = await updateItemLot(id, patch);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  });
}
