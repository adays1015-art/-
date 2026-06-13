"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Store } from "lucide-react";
import clsx from "clsx";
import { CartProvider, useCart } from "@/lib/storeCart";
import { PRODUCT_TYPE_LABELS } from "@/data/storeCatalog";

const NAV: { href: string; label: string }[] = [
  { href: "/product", label: "All" },
  { href: "/product?type=오일파스텔", label: PRODUCT_TYPE_LABELS["오일파스텔"].en },
  { href: "/product?type=수채물감", label: PRODUCT_TYPE_LABELS["수채물감"].en },
  { href: "/product?type=고체물감", label: PRODUCT_TYPE_LABELS["고체물감"].en },
];

function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center gap-2 rounded-full border border-border bg-bg-panel px-4 py-2 text-sm font-medium text-ink-800 transition hover:border-beige-400"
    >
      <ShoppingBag className="h-4 w-4" />
      <span className="hidden sm:inline">Cart</span>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink-900 px-1 text-[11px] font-semibold text-bg-panel">
          {count}
        </span>
      )}
    </Link>
  );
}

function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/product" className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tracking-tight text-ink-900">B.fter</span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-500">Another Day</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = pathname === n.href.split("?")[0] && n.href === "/product" && pathname === "/product";
            return (
              <Link
                key={n.label}
                href={n.href}
                className={clsx(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  active ? "text-ink-900" : "text-ink-600 hover:text-ink-900",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/wholesale"
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-600 transition hover:text-ink-900 sm:inline-flex"
          >
            <Store className="h-4 w-4" />
            Wholesale
          </Link>
          <CartLink />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-bg-subtle">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="text-lg font-semibold text-ink-900">B.fter</div>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            Scented art materials, made in small batches. Shipping worldwide.
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Shop</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li><Link href="/product" className="hover:text-ink-900">All products</Link></li>
            <li><Link href="/product?type=오일파스텔" className="hover:text-ink-900">Oil pastels</Link></li>
            <li><Link href="/product?type=수채물감" className="hover:text-ink-900">Watercolors</Link></li>
            <li><Link href="/product?type=고체물감" className="hover:text-ink-900">Solid watercolors</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Business</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li><Link href="/wholesale" className="hover:text-ink-900">Wholesale login</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Help</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-600">
            <li>Worldwide shipping</li>
            <li>30-day returns</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-ink-500">
        © {new Date().getFullYear()} B.fter · Another Day. All rights reserved.
      </div>
    </footer>
  );
}

export default function RetailChrome({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider mode="retail">
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </CartProvider>
  );
}
