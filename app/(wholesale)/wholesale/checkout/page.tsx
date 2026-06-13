"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WholesaleGuard } from "@/components/store/WholesaleChrome";
import { useCart } from "@/lib/storeCart";
import { useWholesaleSession } from "@/lib/wholesaleSession";
import { formatKrw, formatQty } from "@/lib/storeFormat";

const FIELD =
  "w-full rounded-lg border border-border bg-bg-panel px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-beige-400";

function CheckoutInner() {
  const { resolved, subtotal, count, clear } = useCart();
  const { account } = useWholesaleSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">No items to order</h1>
        <Link
          href="/wholesale/catalog"
          className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
        >
          Browse catalog
        </Link>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // Mock PO submission — a real portal would post this to the ops backend.
    const poId = "PO-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    setTimeout(() => {
      clear();
      router.push(`/wholesale/order/complete?id=${poId}`);
    }, 700);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Submit purchase order</h1>
      <form onSubmit={handleSubmit} className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Partner</legend>
            <input className={FIELD} defaultValue={account?.company} readOnly />
            <input className={FIELD} required placeholder="Purchasing contact name" />
            <input className={FIELD} type="email" required placeholder="Contact email" />
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Delivery</legend>
            <input className={FIELD} required placeholder="Delivery address" />
            <input className={FIELD} placeholder="Requested delivery date (optional)" />
            <textarea className={FIELD} rows={3} placeholder="Notes / PO reference (optional)" />
          </fieldset>

          <div className="rounded-lg border border-dashed border-border bg-bg-subtle p-4 text-xs text-ink-500">
            Demo portal — submitting issues a purchase order request only. Payment
            terms ({account?.discountNote}) are settled per your agreement; no card is charged.
          </div>
        </div>

        <aside className="h-fit rounded-xl2 border border-border bg-bg-panel p-5 shadow-card">
          <div className="text-sm font-semibold text-ink-900">Order summary</div>
          <ul className="mt-4 space-y-3">
            {resolved.map((l) => (
              <li key={l.slug} className="flex justify-between gap-3 text-sm">
                <span className="text-ink-600">
                  {l.product.name} × {formatQty(l.qty)}
                </span>
                <span className="text-ink-900">{formatKrw(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between text-ink-600">
              <span>Subtotal</span>
              <span>{formatKrw(subtotal)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>VAT (10%)</span>
              <span>{formatKrw(vat)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-semibold text-ink-900">
              <span>Total</span>
              <span>{formatKrw(total)}</span>
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-full bg-ink-900 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800 disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit purchase order"}
          </button>
        </aside>
      </form>
    </div>
  );
}

export default function WholesaleCheckoutPage() {
  return (
    <WholesaleGuard>
      <CheckoutInner />
    </WholesaleGuard>
  );
}
