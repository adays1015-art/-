import { NextResponse } from "next/server";
import { listTabs } from "@/services/csvSync";
import { getSheetsMode } from "@/lib/googleSheets";
import { getEffectiveSheetId } from "@/lib/runtimeConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const [mode, sheetId] = await Promise.all([getSheetsMode(), getEffectiveSheetId()]);
  return NextResponse.json({
    mode,
    sheetId: sheetId ?? null,
    tabs: listTabs(),
  });
}
