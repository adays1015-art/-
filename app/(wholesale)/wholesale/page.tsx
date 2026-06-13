"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useWholesaleSession } from "@/lib/wholesaleSession";
import { WHOLESALE_ACCOUNTS } from "@/data/storeCatalog";

function WholesaleLoginInner() {
  const { account, hydrated, signIn } = useWholesaleSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/wholesale/catalog";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Already signed in → skip the login screen.
  useEffect(() => {
    if (hydrated && account) router.replace(next);
  }, [hydrated, account, router, next]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = signIn(code);
    if (!res.ok) {
      setError(res.error ?? "Sign-in failed");
      return;
    }
    router.replace(next);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-20">
      <div className="rounded-xl2 border border-border bg-bg-panel p-8 shadow-card">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-ink-900 text-bg-panel">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-ink-900">
          Wholesale partner sign-in
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Enter your member access code to view wholesale pricing and place bulk orders.
          No separate ID or password required.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="Member access code"
            autoFocus
            className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2.5 text-sm uppercase tracking-wider text-ink-900 outline-none transition focus:border-beige-400"
          />
          {error && <p className="text-xs text-status-danger">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-full bg-ink-900 py-3 text-sm font-semibold text-bg-panel transition hover:bg-ink-800"
          >
            Enter wholesale portal
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-bg-subtle p-3 text-xs text-ink-500">
          <div className="font-semibold text-ink-700">Demo access codes</div>
          <ul className="mt-1 space-y-0.5">
            {WHOLESALE_ACCOUNTS.map((a) => (
              <li key={a.code}>
                <code className="text-ink-800">{a.code}</code> — {a.company}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function WholesaleLoginPage() {
  return (
    <Suspense fallback={null}>
      <WholesaleLoginInner />
    </Suspense>
  );
}
