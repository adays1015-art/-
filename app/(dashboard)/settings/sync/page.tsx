import { listTabs } from "@/services/csvSync";
import { getEffectiveSheetId } from "@/lib/runtimeConfig";
import { APP_AUTH_COOKIE, verifyCookie } from "@/lib/appAuth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SyncClient from "./SyncClient";
import AdminGate from "@/components/AdminGate";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
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
  const tabs = listTabs();
  const sheetId = (await getEffectiveSheetId()) ?? "";
  return <AdminGate><SyncClient initial={{ tabs, sheetId }} /></AdminGate>;
}
