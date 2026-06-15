import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
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
        {session ? (
          <div className="flex min-h-screen">
            <Sidebar session={session} />
            <main className="flex-1 min-w-0 px-6 py-8 lg:px-10">{children}</main>
          </div>
        ) : (
          <main className="min-h-screen">{children}</main>
        )}
      </body>
    </html>
  );
}
