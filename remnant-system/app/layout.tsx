import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "잔재관리 시스템",
  description: "비정형 철판 잔재 통합관리 시스템 V2.0 — 관리자 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={sans.variable}>
      <body className="bg-bg text-ink-900 font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
