"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      try {
        localStorage.removeItem("bfter.role");
        localStorage.removeItem("bfter.loggedInAt");
      } catch { /* ignore */ }
      router.replace("/login");
      setTimeout(() => router.refresh(), 50);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={logout}
      disabled={busy}
      className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900 px-2 py-1 rounded-md hover:bg-bg-subtle border border-border"
      title="로그아웃"
    >
      <LogOut size={13} /> 로그아웃
    </button>
  );
}
