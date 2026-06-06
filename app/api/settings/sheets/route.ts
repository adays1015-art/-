import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveAppsScriptUrl, getRuntimeConfig, getStoredAppsScriptUrl, setRuntimeConfig } from "@/lib/runtimeConfig";
import { getSheetsClient, getSheetsMode, SHEET_TABS } from "@/lib/googleSheets";
import { appsScriptGetSheet, pingAppsScript } from "@/lib/appsScript";
import { getLastTrace } from "@/lib/appsScriptDebug";
import { APP_AUTH_COOKIE, verifyCookie } from "@/lib/appAuth";
import { cookies } from "next/headers";

async function buildSetup() {
  const oauthEnabled = !!process.env.GOOGLE_CLIENT_ID;
  const session = oauthEnabled ? await getServerSession(authOptions) : null;
  const cfg = await getRuntimeConfig();

  const env = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
  };
  const missingEnv = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  const oauthConfigured = missingEnv.length === 0;

  const sheetIdEffective = process.env.GOOGLE_SHEET_ID || cfg.sheetId || null;
  // Stored URL ignores mock override; effective URL respects it.
  const appsScriptUrlStored = (await getStoredAppsScriptUrl()) ?? null;
  const appsScriptUrlEffective = (await getEffectiveAppsScriptUrl()) ?? null;
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  const loggedIn = !!session?.user?.email;
  const hasServiceAccount = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  const mode = await getSheetsMode();

  return {
    env, missingEnv, oauthConfigured, hasServiceAccount,
    sheetIdSet: !!sheetIdEffective,
    sheetIdEffective,
    sheetIdFromEnv: !!process.env.GOOGLE_SHEET_ID,
    sheetIdFromRuntime: !!cfg.sheetId,
    appsScriptUrlStored,
    appsScriptUrlEffective,
    appsScriptUrlFromEnv: !!process.env.APPS_SCRIPT_URL,
    appsScriptUrlFromRuntime: !!cfg.appsScriptUrl,
    useMockOverride: !!cfg.useMockOverride,
    runtimeUpdatedAt: cfg.updatedAt ?? null,
    runtimeUpdatedBy: cfg.updatedBy ?? null,
    loggedIn,
    user: session?.user?.email ?? null,
    hasAccessToken: !!accessToken,
    mode,
    ready:
      mode === "apps-script" ||
      mode === "service-account" ||
      (mode === "oauth" && !!accessToken),
    tabs: SHEET_TABS,
    lastTrace: getLastTrace(),
  };
}

function requireAdmin(): { ok: true } | { ok: false; res: NextResponse } {
  const cookie = cookies().get(APP_AUTH_COOKIE)?.value;
  const sess = verifyCookie(cookie);
  if (!sess) return { ok: false, res: NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  if (sess.role !== "관리자") return { ok: false, res: NextResponse.json({ ok: false, error: "접근 권한이 없습니다." }, { status: 403 }) };
  return { ok: true };
}

export async function GET() {
  return NextResponse.json(await buildSetup());
}

/**
 * POST /api/settings/sheets
 * Body (any subset):
 *   { sheetId?: string }                  — save Sheet ID
 *   { appsScriptUrl?: string }            — save Apps Script URL (replaces previous)
 *   { clearAppsScriptUrl: true }          — remove the saved URL (→ mock if nothing else set)
 *   { useMockOverride?: boolean }         — toggle "샘플 모드로 전환" without clearing URL
 *
 * All mutations require role 관리자.
 */
export async function POST(req: Request) {
  const gate = requireAdmin();
  if (!gate.ok) return gate.res;

  const cookie = cookies().get(APP_AUTH_COOKIE)?.value;
  const sess = verifyCookie(cookie);
  const updatedBy = sess?.role ?? "local";

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 }); }

  const patch: import("@/lib/runtimeConfig").RuntimeConfig = { updatedBy };

  if (body.clearAppsScriptUrl === true) {
    patch.appsScriptUrl = undefined;
  } else if (body.appsScriptUrl !== undefined) {
    patch.appsScriptUrl = String(body.appsScriptUrl).trim() || undefined;
  }
  if (body.sheetId !== undefined) {
    patch.sheetId = String(body.sheetId).trim() || undefined;
  }
  if (body.useMockOverride !== undefined) {
    patch.useMockOverride = !!body.useMockOverride;
  }

  try {
    const saved = await setRuntimeConfig(patch);
    return NextResponse.json({
      ok: true,
      saved: {
        sheetId: saved.sheetId ?? null,
        appsScriptUrl: saved.appsScriptUrl ?? null,
        useMockOverride: !!saved.useMockOverride,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Connection test. Routes by mode and returns a structured Korean message.
 */
export async function PUT() {
  const gate = requireAdmin();
  if (!gate.ok) return gate.res;
  const setup = await buildSetup();

  if (setup.mode === "mock") {
    return NextResponse.json({
      ok: false,
      reason: "mock_mode",
      message: "현재는 샘플 데이터 모드입니다. Apps Script URL 또는 OAuth 설정을 먼저 입력하세요.",
      setup,
    });
  }

  if (setup.mode === "apps-script") {
    const url = setup.appsScriptUrlEffective!;
    const ping = await pingAppsScript(url);
    if (!ping.ok) {
      return NextResponse.json({
        ok: false,
        reason: "apps_script_ping_failed",
        message: `Apps Script ping 실패: ${ping.message}`,
        setup,
      }, { status: 502 });
    }
    // Also probe a known tab to confirm sheet access end-to-end.
    try {
      const rows = await appsScriptGetSheet(url, SHEET_TABS.items);
      return NextResponse.json({
        ok: true,
        reason: "success",
        message: `Apps Script 연결 정상 — 품목마스터에서 ${rows.length}행을 가져왔습니다.`,
        pingMessage: ping.message,
        sampleRowCount: rows.length,
        setup,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        reason: "apps_script_getsheet_failed",
        message: `Apps Script ping은 성공했지만 시트 읽기에 실패했습니다: ${(err as Error).message}`,
        setup,
      }, { status: 502 });
    }
  }

  if (setup.mode === "oauth" && !setup.hasAccessToken) {
    return NextResponse.json({
      ok: false,
      reason: "no_access_token",
      message: "현재 세션에 Google Sheets 접근 권한(access token)이 없습니다. 로그아웃 후 다시 로그인하세요.",
      setup,
    });
  }

  // oauth (with token) or service-account — go via googleapis
  const client = await getSheetsClient();
  if (!client) {
    return NextResponse.json({
      ok: false,
      reason: "client_unavailable",
      message: "Sheets 클라이언트를 만들 수 없습니다.",
      setup,
    });
  }

  try {
    const meta = await client.spreadsheets.get({
      spreadsheetId: setup.sheetIdEffective!,
      fields: "properties.title,sheets.properties.title",
    });
    const tabsPresent = (meta.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter(Boolean) as string[];
    const expected = Object.values(SHEET_TABS);
    const missingTabs = expected.filter((t) => !tabsPresent.includes(t));
    return NextResponse.json({
      ok: missingTabs.length === 0,
      reason: missingTabs.length === 0 ? "success" : "missing_tabs",
      title: meta.data.properties?.title ?? "",
      tabsPresent,
      missingTabs,
      expected,
      setup,
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({
      ok: false,
      reason: "api_error",
      message: `Google Sheets API 오류: ${msg}`,
      setup,
    }, { status: 500 });
  }
}
