"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut, PackageCheck, ShoppingCart } from "lucide-react";
import { CartProvider, useCart } from "@/lib/storeCart";
import { WholesaleSessionProvider, useWholesaleSession } from "@/lib/wholesaleSession";

function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/wholesale/cart"
      className="relative inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white/90 transition hover:border-white/50"
    >
      <ShoppingCart className="h-4 w-4" />
      <span className="hidden sm:inline">Order list</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-beige-400 px-1 text-[11px] font-semibold text-ink-900">
          {count}
        </span>
      )}
    </Link>
  );
}

function Header() {
  const { account, signOut } = useWholesaleSession();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href={account ? "/wholesale/catalog" : "/wholesale"} className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight">B.fter</span>
          <span className="rounded bg-beige-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-900">
            Wholesale
          </span>
        </Link>
        {account && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{account.company}</div>
              <div className="text-[11px] text-white/50">{account.discountNote}</div>
            </div>
            <CartLink />
            <button
              onClick={() => {
                signOut();
                router.push("/wholesale");
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-white/70 transition hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
        {!account && (
          <Link href="/product" className="text-sm text-white/70 transition hover:text-white">
            ← Retail store
          </Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-bg-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5">
          <PackageCheck className="h-3.5 w-3.5" /> B.fter Wholesale · B2B partner portal
        </span>
        <Link href="/product" className="hover:text-ink-900">Go to retail store →</Link>
      </div>
    </footer>
  );
}

/** Redirects gated wholesale pages to the login screen when not signed in. */
export function WholesaleGuard({ children }: { children: React.ReactNode }) {
  const { account, hydrated } = useWholesaleSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !account) {
      router.replace(`/wholesale?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, account, router, pathname]);

  if (!hydrated) {
    return <div className="mx-auto max-w-6xl px-5 py-24 text-center text-sm text-ink-500">Loading…</div>;
  }
  if (!account) return null;
  return <>{children}</>;
}

export default function WholesaleChrome({ children }: { children: React.ReactNode }) {
  return (
    <WholesaleSessionProvider>
      <CartProvider mode="wholesale">
        <div className="flex min-h-screen flex-col bg-bg">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </CartProvider>
    </WholesaleSessionProvider>
  );
}
