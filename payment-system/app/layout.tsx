import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "거래문서 출력",
  description: "견적서 · 거래명세서 · 인보이스 · 발주서 작성 및 인쇄",
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
