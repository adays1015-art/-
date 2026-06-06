import SheetsSettingsClient from "./SheetsSettingsClient";
import AdminGate from "@/components/AdminGate";
import { getRuntimeConfig, getEffectiveAppsScriptUrl, getStoredAppsScriptUrl } from "@/lib/runtimeConfig";
import { getSheetsMode, SHEET_TABS } from "@/lib/googleSheets";
import { getLastTrace } from "@/lib/appsScriptDebug";
import { APP_AUTH_COOKIE, verifyCookie } from "@/lib/appAuth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SheetsSettingsPage() {
  const session = verifyCookie(cookies().get(APP_AUTH_COOKIE)?.value);
  if (!session) redirect("/login");
  if (session.role !== "관리자") {
    return (
      <div className="max-w-md mx-auto mt-20 panel panel-pad text-center">
        <div className="text-base font-semibold text-ink-900">접근 권한이 없습니다.</div>
        <div className="text-sm text-ink-600 mt-2">이 페이지는 관리자만 접근할 수 있습니다.</div>
      </div>
    );
  }

  const [cfg, mode, stored, effective] = await Promise.all([
    getRuntimeConfig(),
    getSheetsMode(),
    getStoredAppsScriptUrl(),
    getEffectiveAppsScriptUrl(),
  ]);

  return (
    <AdminGate>
    <SheetsSettingsClient
      initial={{
        sheetId: cfg.sheetId ?? "",
        sheetIdFromEnv: !!process.env.GOOGLE_SHEET_ID,
        sheetIdEffective: process.env.GOOGLE_SHEET_ID || cfg.sheetId || "",
        appsScriptUrlStored: stored ?? "",
        appsScriptUrlEffective: effective ?? "",
        appsScriptUrlFromEnv: !!process.env.APPS_SCRIPT_URL,
        useMockOverride: !!cfg.useMockOverride,
        mode,
        updatedAt: cfg.updatedAt ?? null,
        updatedBy: cfg.updatedBy ?? null,
        tabs: SHEET_TABS,
        lastTrace: getLastTrace(),
      }}
    />
    </AdminGate>
  );
}
