"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ReceiptText, Wallet } from "lucide-react";

const NAV = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/charges", label: "청구·수금", icon: ReceiptText },
  { href: "/clients", label: "거래처", icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-panel min-h-screen sticky top-0 hidden md:flex flex-col">
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <div className="flex items-center gap-2 text-ink-900">
          <Wallet size={18} className="text-beige-600" />
          <div className="text-base font-semibold">결제관리 시스템</div>
        </div>
        <div className="mt-1 text-[11px] text-ink-500">청구 · 수금 · 미수금 관리</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                active ? "bg-beige-100 text-ink-900 font-medium" : "text-ink-700 hover:bg-bg-subtle"
              }`}
            >
              <Icon size={16} className={active ? "text-beige-600" : "text-ink-500"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-3 border-t border-border text-[11px] text-ink-500 leading-relaxed">
        <div>v0.1 · 결제관리</div>
      </div>
    </aside>
  );
}
