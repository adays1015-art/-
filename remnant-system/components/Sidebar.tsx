"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layers } from "lucide-react";

export const NAV = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/remnants", label: "잔재 목록", icon: Layers },
];

export function isActive(pathname: string | null, href: string) {
  return href === "/" ? pathname === "/" : !!pathname?.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-panel min-h-screen sticky top-0 hidden md:flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <div className="flex items-center gap-2 text-ink-900">
          <Layers size={18} className="text-brand-700" />
          <div className="text-base font-semibold">잔재관리 시스템</div>
        </div>
        <div className="mt-1 text-[11px] text-ink-500">비정형 철판 잔재 통합관리 V2.0</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${active ? "bg-brand-100 text-brand-800 font-medium" : "text-ink-700 hover:bg-bg-subtle"}`}>
              <Icon size={16} className={active ? "text-brand-700" : "text-ink-500"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-border text-[11px] text-ink-500">v0.1 · 대림산업 부산 사업장</div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden border-b border-border bg-bg-panel px-4 py-3 flex items-center justify-between">
      <div className="font-semibold text-ink-900">잔재관리 시스템</div>
      <nav className="flex gap-1">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}
            className={`px-2.5 py-1 text-sm rounded-md ${isActive(pathname, item.href) ? "bg-brand-100 text-brand-800 font-medium" : "text-ink-600"}`}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
