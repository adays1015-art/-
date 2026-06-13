"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle } from "lucide-react";
import { WholesaleGuard } from "@/components/store/WholesaleChrome";
import { useCart } from "@/lib/storeCart";
import { productGradient } from "@/data/storeCatalog";
import { formatKrw, formatQty } from "@/lib/storeFormat";

function CartInner() {
  const { resolved, subtotal, setQty, remove, count } = useCart();
  const router = useRouter();

  const hasMoqIssue = resolved.some((l) => l.qty < l.product.moq);
  const vat = Math.round(subtotal * 0.1);
  const total = subtotal + vat;

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">No items in your order</h1>
        <Link
          href="/wholesale/catalog"
          className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
        >
          Browse catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Purchase order</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-border">
          {resolved.map((l) => {
            const below = l.qty < l.product.moq;
            return (
              <li key={l.slug} className="flex gap-4 py-5">
                <div
                  className="h-16 w-16 shrink-0 rounded-lg border border-border"
                  style={{ background: productGradient(l.product) }}
                />
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{l.product.name}</div>
                      <div className="text-xs text-ink-500">
                        {formatKrw(l.unitPrice)} / ea · MOQ {formatQty(l.product.moq)}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(l.slug, l.colorItemNo)}
                      className="text-ink-400 hover:text-status-danger"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={l.qty}
                        onChange={(e) => setQty(l.slug, l.colorItemNo, Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 rounded-lg border border-border bg-bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-beige-400"
                      />
                      {below && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-status-danger">
                          <AlertTriangle className="h-3 w-3" /> below MOQ
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-ink-900">{formatKrw(l.lineTotal)}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit rounded-xl2 border border-border bg-bg-panel p-5 shadow-card">
          <div className="flex justify-between text-sm text-ink-600">
            <span>Subtotal</span>
            <span className="font-semibold text-ink-900">{formatKrw(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-ink-600">
            <span>VAT (10%)</span>
            <span>{formatKrw(vat)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold text-ink-900">
            <span>Total</span>
            <span>{formatKrw(total)}</span>
          </div>
          {hasMoqIssue && (
            <p className="mt-3 text-xs text-status-danger">
              Some items are below their minimum order quantity. Adjust quantities to proceed.
            </p>
          )}
          <button
            onClick={() => router.push("/wholesale/checkout")}
            disabled={hasMoqIssue}
            className="mt-4 w-full rounded-full bg-ink-900 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800 disabled:opacity-40"
          >
            Continue to order
          </button>
          <Link
            href="/wholesale/catalog"
            className="mt-3 block text-center text-xs text-ink-500 hover:text-ink-900"
          >
            Back to catalog
          </Link>
        </aside>
      </div>
    </div>
  );
}

export default function WholesaleCartPage() {
  return (
    <WholesaleGuard>
      <CartInner />
    </WholesaleGuard>
  );
}
