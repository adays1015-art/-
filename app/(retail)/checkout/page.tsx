"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/storeCart";
import { formatUsd } from "@/lib/storeFormat";

const FIELD =
  "w-full rounded-lg border border-border bg-bg-panel px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-beige-400";

export default function CheckoutPage() {
  const { resolved, subtotal, count, clear } = useCart();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const shipping = subtotal >= 80 || count === 0 ? 0 : 9;
  const total = subtotal + shipping;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">Nothing to check out</h1>
        <Link href="/product" className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800">
          Back to shop
        </Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Mock order placement — no real payment gateway is wired up.
    const orderId = "BF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    setTimeout(() => {
      clear();
      router.push(`/order/complete?id=${orderId}`);
    }, 700);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Checkout</h1>
      <form onSubmit={handleSubmit} className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Contact</legend>
            <input className={FIELD} type="email" required placeholder="Email" />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Shipping address</legend>
            <div className="grid grid-cols-2 gap-3">
              <input className={FIELD} required placeholder="First name" />
              <input className={FIELD} required placeholder="Last name" />
            </div>
            <input className={FIELD} required placeholder="Address" />
            <div className="grid grid-cols-3 gap-3">
              <input className={FIELD} required placeholder="City" />
              <input className={FIELD} required placeholder="Country" />
              <input className={FIELD} required placeholder="ZIP / Postal" />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Payment</legend>
            <div className="rounded-lg border border-dashed border-border bg-bg-subtle p-4 text-xs text-ink-500">
              Demo checkout — no card is charged. A real payment provider
              (e.g. Stripe / PayPal) would be connected here.
            </div>
            <input className={FIELD} placeholder="Card number (demo — any value)" />
          </fieldset>
        </div>

        <aside className="h-fit rounded-xl2 border border-border bg-bg-panel p-5 shadow-card">
          <div className="text-sm font-semibold text-ink-900">Order summary</div>
          <ul className="mt-4 space-y-3">
            {resolved.map((l) => (
              <li key={`${l.slug}-${l.colorItemNo ?? ""}`} className="flex justify-between gap-3 text-sm">
                <span className="text-ink-600">
                  {l.product.name}
                  {l.colorName ? ` · ${l.colorName}` : ""} × {l.qty}
                </span>
                <span className="text-ink-900">{formatUsd(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between text-ink-600">
              <span>Subtotal</span>
              <span>{formatUsd(subtotal)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>Shipping</span>
              <span>{shipping === 0 ? "Free" : formatUsd(shipping)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-semibold text-ink-900">
              <span>Total</span>
              <span>{formatUsd(total)}</span>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-full bg-ink-900 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800 disabled:opacity-60"
          >
            {submitting ? "Placing order…" : `Place order · ${formatUsd(total)}`}
          </button>
        </aside>
      </form>
    </div>
  );
}
