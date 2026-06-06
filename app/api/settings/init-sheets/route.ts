import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth";
import { SHEET_DEFS } from "@/lib/sheetDefs";
import { getEffectiveAppsScriptUrl } from "@/lib/runtimeConfig";
import { getSheetsMode } from "@/lib/googleSheets";
import { appsScriptInitializeSheets } from "@/lib/appsScript";
import { withErrorHandling } from "@/lib/apiError";

/**
 * POST /api/settings/init-sheets
 * Admin-only. Calls the Apps Script initializeSheets action with the canonical
 * SHEET_DEFS. Returns per-sheet status (created / header-added / skipped / error).
 */
export async function POST() {
  const gate = requireRole("settings");
  if (!gate.ok) return gate.res;

  return withErrorHandling("init-sheets", undefined, async () => {
    const mode = await getSheetsMode();
    if (mode !== "apps-script") {
      return NextResponse.json({
        ok: false,
        error: `현재 모드는 ${mode} 입니다. Apps Script 모드에서만 시트 초기화가 가능합니다.`,
      }, { status: 400 });
    }

    const url = await getEffectiveAppsScriptUrl();
    if (!url) {
      return NextResponse.json({
        ok: false,
        error: "Apps Script URL이 설정되지 않았습니다.",
      }, { status: 400 });
    }

    const specs = SHEET_DEFS.map((d) => ({ sheetName: d.sheetName, headers: d.headers }));
    const results = await appsScriptInitializeSheets(url, specs);
    const counts = {
      created: results.filter((r) => r.status === "created").length,
      header_added: results.filter((r) => r.status === "header-added").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      error: results.filter((r) => r.status === "error").length,
    };
    return NextResponse.json({ ok: true, results, counts });
  });
}

/** Convenience GET — returns the canonical definitions for UI preview. */
export async function GET() {
  return NextResponse.json({ defs: SHEET_DEFS });
}
