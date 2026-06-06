/**
 * Lightweight admin PIN gate — UI level only, not full auth.
 * State lives in sessionStorage so it auto-clears when the browser/tab closes.
 *
 *   PIN source:  process.env.NEXT_PUBLIC_ADMIN_PIN  (fallback "0518")
 *   Storage key: bfter-admin-unlocked   ("1" when unlocked)
 */

export const ADMIN_PIN: string = process.env.NEXT_PUBLIC_ADMIN_PIN || "0518";
export const ADMIN_LOCK_KEY = "bfter-admin-unlocked";

/** Routes that require an unlocked admin session before showing content. */
export const ADMIN_PROTECTED_ROUTES: ReadonlyArray<string> = [
  "/daily-report",
  "/history",
  "/cost",
  "/schema",
  "/settings/sync",
  "/settings/sheets",
];

export function isAdminProtected(pathname: string): boolean {
  return ADMIN_PROTECTED_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function isAdminUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ADMIN_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockAdmin(pin: string): boolean {
  if (typeof window === "undefined") return false;
  const ok = String(pin || "").trim() === ADMIN_PIN;
  if (ok) {
    try { window.sessionStorage.setItem(ADMIN_LOCK_KEY, "1"); } catch { /* noop */ }
  }
  return ok;
}

export function lockAdmin(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(ADMIN_LOCK_KEY); } catch { /* noop */ }
}
