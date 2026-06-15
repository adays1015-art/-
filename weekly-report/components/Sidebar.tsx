"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FileText, Receipt, Users, LogOut } from "lucide-react";
import type { Session } from "@/lib/types";

type Item = { href: string; label: string; icon: typeof FileText; managerOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/reports", label: "주간 작업보고", icon: FileText },
  { href: "/expense", label: "지출결의서", icon: Receipt },
  { href: "/status", label: "제출현황", icon: Users, managerOnly: true },
];

export default function Sidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const router = useRouter();
  const isManager = session.role === "관리자";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items = ITEMS.filter((i) => !i.managerOnly || isManager);

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-bg-panel min-h-screen sticky top-0 hidden md:flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <div className="text-[11px] font-medium tracking-[0.22em] text-ink-500 uppercase">B.fter · Another Day</div>
        <div className="mt-1 text-base font-semibold text-ink-900">주간업무관리</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
                ${active ? "bg-ink-900 text-bg" : "text-ink-700 hover:bg-bg-subtle"}`}>
              <Icon size={16} /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-ink-600 mb-2 truncate">
          {session.team ? `${session.team} · ` : ""}{session.name}
          <span className="ml-1 text-ink-400">({session.role})</span>
        </div>
        <button onClick={logout}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-ink-700 hover:bg-bg-subtle">
          <LogOut size={14} /> 로그아웃
        </button>
      </div>
    </aside>
  );
}
