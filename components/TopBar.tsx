import { getSheetsMode } from "@/lib/googleSheets";
import type { Role } from "@/lib/roles";
import { ROLE_ABBR } from "@/lib/roles";
import LogoutButton from "./LogoutButton";

const MODE_BADGE: Record<Awaited<ReturnType<typeof getSheetsMode>>, { label: string; cls: string; dot: string; title: string }> = {
  "mock": {
    label: "샘플 데이터 모드",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
    title: "Google Sheets 미연결 — 메모리 샘플 데이터로 동작",
  },
  "apps-script": {
    label: "Google Sheets 실데이터 모드",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    title: "Apps Script 프록시를 통한 실시간 Google Sheets 연결",
  },
  "oauth": {
    label: "OAuth 연결",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    title: "로그인한 Google 계정 권한으로 시트에 접근",
  },
  "service-account": {
    label: "Service Account 연결",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    title: "서비스 계정 키로 시트에 접근",
  },
};

const ROLE_CLS: Record<Role, string> = {
  "관리자": "bg-ink-900 text-bg border-ink-900",
  "생산팀": "bg-blue-50 text-blue-800 border-blue-200",
  "조회자": "bg-bg-subtle text-ink-700 border-border",
};

export default async function TopBar({ role }: { role: Role }) {
  const mode = await getSheetsMode();
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const badge = MODE_BADGE[mode];
  return (
    <header className="border-b border-border bg-bg-panel/80 backdrop-blur sticky top-0 z-20">
      <div className="flex items-center justify-between px-6 lg:px-8 py-3 gap-3">
        <div className="text-sm text-ink-600 truncate">{today}</div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/settings/sheets"
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border hover:opacity-90 ${badge.cls}`}
            title={badge.title}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </a>
          <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border font-medium ${ROLE_CLS[role]}`}>
            <span className="text-[10px] opacity-70 font-mono">{ROLE_ABBR[role]}</span>
            <span>{role}</span>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
