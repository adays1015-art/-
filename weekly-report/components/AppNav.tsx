"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Users, FileText, LogOut } from "lucide-react";
import type { Session } from "@/lib/types";

export default function AppNav({ session }: { session: Session }) {
  const pathname = usePathname();
  const router = useRouter();
  const isManager = session.role === "관리자";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const link = (href: string, label: string, Icon: typeof FileText) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link href={href}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors
          ${active ? "bg-ink-900 text-bg border-ink-900" : "bg-bg-panel text-ink-700 border-border hover:bg-bg-subtle"}`}>
        <Icon size={14} /> {label}
      </Link>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {isManager && link("/", "달력", CalendarDays)}
      {isManager && link("/status", "제출현황", Users)}
      {link("/reports", "주간보고", FileText)}
      <div className="ml-2 flex items-center gap-2 text-xs text-ink-500">
        <span className="hidden sm:inline">{session.team ? `${session.team} · ` : ""}{session.name} ({session.role})</span>
        <button onClick={logout} className="inline-flex items-center gap-1 text-ink-500 hover:text-ink-900" title="로그아웃">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
