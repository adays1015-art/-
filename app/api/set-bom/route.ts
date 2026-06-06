/**
 * 세트BOM API.
 *
 *   GET  /api/set-bom            → 진단/조회 (mode + 시도 결과 + raw 행 등)
 *   POST /api/set-bom            → CRUD dispatching via { action }
 *     { action: "create", line: {...} }     → 새 row 추가
 *     { action: "update", id, patch: {...} } → row 수정
 *     { action: "delete", id }              → 소프트 삭제 (note 에 [삭제됨] prefix)
 *
 * 신규 시트 생성·스키마 자동 변경 없음 — 시트는 사용자가 직접 관리.
 */
import { NextResponse } from "next/server";
import {
  readRows, getSheetsMode, SHEET_TABS,
} from "@/lib/googleSheets";
import {
  getEffectiveAppsScriptUrl, getEffectiveSheetId,
} from "@/lib/runtimeConfig";
import {
  createSetBomLine, updateSetBomLine, softDeleteSetBomLine, listSetBom,
} from "@/services/setBom";
import type { SetBomComponentType } from "@/types";

export const dynamic = "force-dynamic";

// ─── GET: diagnostic + list ──────────────────────────────────
type Attempt = {
  sheetNameTried: string;
  range: string;
  ok: boolean;
  count: number;
  firstRow: Record<string, string> | null;
  rawError: string | null;
  errorDetail: unknown;
};

async function tryFetch(sheetName: string): Promise<Attempt> {
  const range = `${sheetName}!A1:Z`;
  try {
    const rows = await readRows<Record<string, string>>(sheetName);
    return {
      sheetNameTried: sheetName, range, ok: true,
      count: rows.length, firstRow: rows[0] ?? null,
      rawError: null, errorDetail: null,
    };
  } catch (err) {
    let rawError = (err as Error).message ?? String(err);
    let errorDetail: unknown = null;
    type WithDetail = { detail?: { httpStatus?: number; responseBody?: string; errorMessage?: string; url?: string } };
    const detail = (err as WithDetail).detail;
    if (detail) {
      errorDetail = {
        httpStatus: detail.httpStatus,
        responseBody: typeof detail.responseBody === "string"
          ? detail.responseBody.slice(0, 800)
          : detail.responseBody,
        errorMessage: detail.errorMessage,
        url: detail.url,
      };
      if (detail.errorMessage) rawError = detail.errorMessage;
    }
    return {
      sheetNameTried: sheetName, range, ok: false,
      count: 0, firstRow: null, rawError, errorDetail,
    };
  }
}

export async function GET() {
  let mode = "(unknown)";
  let appsScriptUrl: string | null = null;
  let sheetId: string | null = null;
  try {
    mode = await getSheetsMode();
    appsScriptUrl = (await getEffectiveAppsScriptUrl()) ?? null;
    sheetId = (await getEffectiveSheetId()) ?? null;
  } catch (err) {
    return NextResponse.json({
      ok: false, stage: "init",
      error: (err as Error).message ?? String(err),
      mode, appsScriptUrl, sheetId,
    });
  }

  const configured = SHEET_TABS.setBom;
  const primary = await tryFetch(configured);
  let rows = null as null | unknown[];
  if (primary.ok) {
    try { rows = await listSetBom(); } catch { /* fall through */ }
  }
  return NextResponse.json({
    ok: primary.ok,
    routeAlive: true,
    mode, appsScriptUrl, sheetId,
    sheetNameConfigured: configured,
    primaryAttempt: primary,
    count: rows?.length ?? primary.count,
    rows,
  });
}

// ─── POST: CRUD ─────────────────────────────────────────────
type CreatePayload = {
  action: "create";
  line: {
    setCode: string;
    setName?: string;
    componentType: SetBomComponentType;
    componentCode: string;
    componentName?: string;
    qty: number;
    unitCost?: number;
    unitCostSource?: string;
    note?: string;
  };
};
type UpdatePayload = {
  action: "update";
  id: string;
  patch: Partial<{
    setCode: string;
    setName: string;
    componentType: SetBomComponentType;
    componentCode: string;
    componentName: string;
    qty: number;
    unitCost: number;
    unitCostSource: string;
    note: string;
  }>;
};
type DeletePayload = { action: "delete"; id: string };
type PostPayload = CreatePayload | UpdatePayload | DeletePayload;

export async function POST(req: Request) {
  let body: PostPayload;
  try {
    body = (await req.json()) as PostPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "create") {
      const { line } = body;
      if (!line.setCode || !line.componentType) {
        return NextResponse.json({ ok: false, error: "setCode + componentType 필수" }, { status: 400 });
      }
      const created = await createSetBomLine({
        setCode: line.setCode,
        setName: line.setName ?? "",
        componentType: line.componentType,
        componentCode: line.componentCode ?? "",
        componentName: line.componentName ?? "",
        qty: Number(line.qty) || 0,
        unitCost: Number(line.unitCost) || 0,
        unitCostSource: line.unitCostSource ?? "",
        note: line.note ?? "",
      });
      return NextResponse.json({ ok: true, data: created });
    }
    if (body.action === "update") {
      const updated = await updateSetBomLine(body.id, body.patch);
      if (!updated) {
        return NextResponse.json({ ok: false, error: "row not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: updated });
    }
    if (body.action === "delete") {
      const deleted = await softDeleteSetBomLine(body.id);
      if (!deleted) {
        return NextResponse.json({ ok: false, error: "row not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, data: { id: body.id, softDeleted: true } });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    type WithDetail = { detail?: { httpStatus?: number; responseBody?: string; errorMessage?: string } };
    const detail = (err as WithDetail).detail;
    return NextResponse.json({
      ok: false,
      error: (err as Error).message ?? String(err),
      sheetName: SHEET_TABS.setBom,
      appsScript: detail ?? null,
    }, { status: 500 });
  }
}
