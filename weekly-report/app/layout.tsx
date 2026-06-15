import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "주간업무관리 · B.fter Another Day",
  description: "팀 주간 업무 보고 · 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen">
          <header className="no-print border-b border-border bg-bg-panel sticky top-0 z-20">
            <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-medium tracking-[0.22em] text-ink-500 uppercase">B.fter · Another Day</div>
                <div className="text-base font-semibold text-ink-900 leading-tight">주간업무관리</div>
              </div>
              {session && <AppNav session={session} />}
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
