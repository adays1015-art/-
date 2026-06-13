"use client";

// Lightweight wholesale member "session" for the separated /wholesale screen.
// This is intentionally NOT a full credential system — wholesale partners
// enter a member access code (no id/password pair) to reveal wholesale
// pricing on their own separated screen. Swap findWholesaleAccount for a real
// member lookup when a backend is available.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { findWholesaleAccount, type WholesaleAccount } from "@/data/storeCatalog";

const STORAGE_KEY = "bfter_wholesale_session";

interface WholesaleSessionValue {
  account: WholesaleAccount | null;
  hydrated: boolean;
  signIn: (code: string) => { ok: boolean; error?: string };
  signOut: () => void;
}

const Ctx = createContext<WholesaleSessionValue | null>(null);

export function WholesaleSessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<WholesaleAccount | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setAccount(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const signIn = useCallback((code: string) => {
    const acct = findWholesaleAccount(code);
    if (!acct) return { ok: false, error: "Invalid member code. Please check and try again." };
    setAccount(acct);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(acct));
    } catch {
      /* ignore */
    }
    return { ok: true };
  }, []);

  const signOut = useCallback(() => {
    setAccount(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <Ctx.Provider value={{ account, hydrated, signIn, signOut }}>{children}</Ctx.Provider>
  );
}

export function useWholesaleSession(): WholesaleSessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWholesaleSession must be used within WholesaleSessionProvider");
  return ctx;
}
