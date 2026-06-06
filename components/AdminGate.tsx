"use client";

import { useEffect, useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { ADMIN_PIN, isAdminUnlocked, unlockAdmin } from "@/lib/adminLock";

/**
 * Wraps a page's content with a sessionStorage-backed admin PIN gate.
 *
 *   <AdminGate><MyPage /></AdminGate>
 *
 * - On first client render the lock state is read from sessionStorage.
 * - While locked, children are replaced by a centered PIN prompt; the rest
 *   of the page (sidebar, top bar) stays interactive.
 * - On successful unlock the children render immediately and the gate
 *   stays open for the rest of the browser tab session.
 */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    setUnlocked(isAdminUnlocked());
  }, []);

  // Avoid hydration mismatch — render an empty placeholder until hydrated.
  if (!hydrated) {
    return <div className="min-h-[40vh]" />;
  }

  if (unlocked) return <>{children}</>;

  function trySubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (unlockAdmin(pin)) {
      setUnlocked(true);
      setError(null);
      setPin("");
    } else {
      setError("PIN이 올바르지 않습니다.");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh] no-print">
      <form onSubmit={trySubmit}
        className="panel panel-pad w-full max-w-sm border-2 border-border shadow-sm">
        <div className="flex items-center gap-2 text-ink-900">
          <Lock size={18} className="text-beige-600" />
          <div className="text-base font-semibold">관리자 인증 필요</div>
        </div>
        <div className="text-xs text-ink-500 mt-1">
          이 페이지는 관리자/오너 전용입니다. PIN을 입력해 잠금을 해제하세요.
        </div>
        <label className="label mt-4">PIN</label>
        <div className="relative">
          <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-8 tracking-widest"
            type="password" inputMode="numeric" autoFocus
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(null); }}
            placeholder="••••"
          />
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-[10px] text-ink-500">
            세션 동안 유지 · 브라우저 종료 시 자동 잠금
          </div>
          <button type="submit" className="btn-primary">잠금 해제</button>
        </div>
        {/* Hint for first-time setup; suppressed when a custom PIN is set. */}
        {ADMIN_PIN === "0518" && (
          <div className="mt-3 text-[10px] text-ink-400">
            기본 PIN 사용 중 — 운영 환경에서는 <span className="font-mono">NEXT_PUBLIC_ADMIN_PIN</span>을 설정하세요.
          </div>
        )}
      </form>
    </div>
  );
}
