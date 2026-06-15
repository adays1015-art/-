"use client";

import { useRouter } from "next/navigation";
import { LogOut, UserCircle2 } from "lucide-react";
import type { Session } from "@/lib/types";

export default function TopBar({ session }: { session: Session }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="no-print sticky top-0 z-10 border-b border-border bg-bg-panel/95 backdrop-blur">
      <div className="h-14 px-6 lg:px-10 flex items-center justify-end gap-3">
        <div className="flex items-center gap-2 text-sm">
          <UserCircle2 size={20} className="text-ink-400" />
          <span className="text-ink-900 font-medium">{session.name}</span>
          <span className="text-ink-400 text-xs">
            {session.team ? `${session.team} · ` : ""}{session.role}
          </span>
        </div>
        <button onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-ink-700 hover:bg-bg-subtle">
          <LogOut size={14} /> 로그아웃
        </button>
      </div>
    </header>
  );
}
