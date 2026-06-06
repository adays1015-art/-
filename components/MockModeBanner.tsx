import Link from "next/link";
import { AlertTriangle, Settings } from "lucide-react";
import { getSheetsMode } from "@/lib/googleSheets";

export default async function MockModeBanner() {
  const mode = await getSheetsMode();
  if (mode !== "mock") return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-6 lg:px-8 py-2 text-sm text-amber-900 flex items-center gap-2">
      <AlertTriangle size={14} className="shrink-0 text-amber-600" />
      <span className="flex-1">
        <b>현재는 샘플 데이터 모드입니다.</b> Google Sheets 인증 연결 후 실제 데이터 모드로 전환됩니다.
      </span>
      <Link
        href="/settings/sheets"
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-amber-100 border border-amber-300 hover:bg-amber-200 text-amber-900"
      >
        <Settings size={12} /> 연결 설정
      </Link>
    </div>
  );
}
