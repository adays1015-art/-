"use client";

import { useSyncExternalStore } from "react";
import type { Role, Area } from "@/lib/roles";
import { canEdit } from "@/lib/roles";

/**
 * Read the current role from localStorage (set at login). Client-only —
 * for UI hints/disabled states. Server still enforces with the signed cookie.
 *
 * Uses useSyncExternalStore so the client render returns the actual stored
 * role on first paint (no false → true flicker) WITHOUT producing a
 * hydration mismatch — the SSR snapshot is always null, which matches what
 * the server would render with no client-side state.
 */
function readRole(): Role | null {
  if (typeof window === "undefined") return null;
  try {
    const r = window.localStorage.getItem("bfter.role");
    if (r === "관리자" || r === "생산팀" || r === "조회자") return r;
  } catch { /* ignore */ }
  return null;
}

function subscribeRole(cb: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === "bfter.role") cb();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

// SSR snapshot — always null on the server pass so hydration matches.
const serverSnapshot = (): Role | null => null;

export function useRole(): Role | null {
  return useSyncExternalStore(subscribeRole, readRole, serverSnapshot);
}

export function useCanEdit(area: Area): boolean {
  const role = useRole();
  return canEdit(role, area);
}

export const PERMISSION_TIP = "현재 역할에서는 수정할 수 없습니다.";
