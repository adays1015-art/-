"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/lib/storeCart";
import { productGradient } from "@/data/storeCatalog";
import { formatUsd } from "@/lib/storeFormat";

export default function CartPage() {
  const { resolved, subtotal, setQty, remove, count } = useCart();
  const router = useRouter();

  if (count === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <h1 className="text-2xl font-semibold text-ink-900">Your cart is empty</h1>
        <p className="mt-2 text-sm text-ink-500">Find something that smells as good as it looks.</p>
        <Link
          href="/product"
          className="mt-6 inline-block rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
        >
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Cart</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-border">
          {resolved.map((l) => (
            <li key={`${l.slug}-${l.colorItemNo ?? ""}`} className="flex gap-4 py-5">
              <div
                className="h-20 w-20 shrink-0 rounded-lg border border-border"
                style={{ background: productGradient(l.product) }}
              />
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/product/${l.slug}`} className="text-sm font-semibold text-ink-900 hover:underline">
                      {l.product.name}
                    </Link>
                    {l.colorName && <div className="text-xs text-ink-500">Color: {l.colorName}</div>}
                    <div className="text-xs text-ink-500">{formatUsd(l.unitPrice)} each</div>
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
                  <div className="inline-flex items-center rounded-full border border-border">
                    <button
                      onClick={() => setQty(l.slug, l.colorItemNo, l.qty - 1)}
                      className="grid h-8 w-8 place-items-center text-ink-700 hover:text-ink-900"
                      aria-label="Decrease"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                    <button
                      onClick={() => setQty(l.slug, l.colorItemNo, l.qty + 1)}
                      className="grid h-8 w-8 place-items-center text-ink-700 hover:text-ink-900"
                      aria-label="Increase"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-ink-900">{formatUsd(l.lineTotal)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-xl2 border border-border bg-bg-panel p-5 shadow-card">
          <div className="flex items-center justify-between text-sm text-ink-600">
            <span>Subtotal</span>
            <span className="font-semibold text-ink-900">{formatUsd(subtotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-ink-600">
            <span>Shipping</span>
            <span>Calculated at checkout</span>
          </div>
          <button
            onClick={() => router.push("/checkout")}
            className="mt-5 w-full rounded-full bg-ink-900 py-3 text-sm font-semibold text-bg-panel hover:bg-ink-800"
          >
            Checkout
          </button>
          <Link
            href="/product"
            className="mt-3 block text-center text-xs text-ink-500 hover:text-ink-900"
          >
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
