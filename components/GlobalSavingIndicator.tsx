"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Check, X } from "lucide-react";
import { subscribe, clearError, type SaveTrackerState } from "@/lib/saveTracker";

/**
 * Fixed bottom-right indicator with three states:
 *   - Pending > 0  → blue spinner "저장 중…"
 *   - Recent success (<3s) and no pending → green "✓ 저장됨"
 *   - Last error and no pending → red error pill (sticky until dismissed)
 *
 * The success toast auto-clears after a short timeout so the user sees a
 * confirmation but the page isn't permanently noisy.
 */
const SUCCESS_TOAST_MS = 2500;

export default function GlobalSavingIndicator() {
  const [s, setS] = useState<SaveTrackerState>({
    pending: 0, lastError: null, lastErrorEndpoint: null, lastErrorAt: 0,
    lastSuccessAt: 0, lastSuccessEndpoint: null,
  });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => subscribe(setS), []);

  // Tick once when a success arrives so the toast disappears on schedule.
  useEffect(() => {
    if (!s.lastSuccessAt) return;
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), SUCCESS_TOAST_MS + 50);
    return () => clearTimeout(timer);
  }, [s.lastSuccessAt]);

  if (s.pending > 0) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-ink-900 text-bg px-3 py-1.5 text-xs shadow-lg">
        <Loader2 size={12} className="animate-spin" />
        저장 중… {s.pending > 1 ? `(${s.pending})` : ""}
      </div>
    );
  }

  const recentSuccess = s.lastSuccessAt > 0 && (now - s.lastSuccessAt) < SUCCESS_TOAST_MS;
  if (recentSuccess && !s.lastError) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-emerald-600 text-white px-3 py-1.5 text-xs shadow-lg">
        <Check size={12} />
        저장됨
      </div>
    );
  }

  if (s.lastError) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md bg-red-50 border border-red-300 text-red-900 px-3 py-2 text-xs shadow-lg max-w-sm">
        <AlertTriangle size={14} className="text-red-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">저장 실패</div>
          <div className="truncate" title={s.lastError?.message}>{s.lastError?.message}</div>
        </div>
        <button onClick={() => clearError()} className="text-red-700 hover:text-red-900 shrink-0" title="닫기">
          <X size={12} />
        </button>
      </div>
    );
  }

  return null;
}
