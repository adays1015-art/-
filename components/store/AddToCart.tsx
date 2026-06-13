"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { useCart } from "@/lib/storeCart";
import type { StoreProduct } from "@/data/storeCatalog";

export default function AddToCart({ product }: { product: StoreProduct }) {
  const { add } = useCart();
  const router = useRouter();
  const isRefill = product.kind === "refill";
  const [colorItemNo, setColorItemNo] = useState<string>(
    isRefill ? product.colors[0]?.itemNo ?? "" : "",
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd(goToCart: boolean) {
    add({ slug: product.slug, colorItemNo: isRefill ? colorItemNo : undefined, qty });
    if (goToCart) {
      router.push("/cart");
      return;
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div className="space-y-5">
      {isRefill && (
        <div>
          <div className="mb-2 text-sm font-medium text-ink-800">
            Color:{" "}
            <span className="text-ink-600">
              {product.colors.find((c) => c.itemNo === colorItemNo)?.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c.itemNo}
                type="button"
                onClick={() => setColorItemNo(c.itemNo)}
                title={`${c.name} · ${c.scent}`}
                aria-label={c.name}
                className={`h-9 w-9 rounded-full border-2 transition ${
                  colorItemNo === c.itemNo
                    ? "border-ink-900 ring-2 ring-ink-900/15"
                    : "border-white shadow"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="inline-flex items-center rounded-full border border-border">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="grid h-10 w-10 place-items-center text-ink-700 hover:text-ink-900"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
          <button
            type="button"
            onClick={() => setQty((q) => q + 1)}
            className="grid h-10 w-10 place-items-center text-ink-700 hover:text-ink-900"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => handleAdd(false)}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-900 px-6 py-3 text-sm font-semibold text-ink-900 transition hover:bg-ink-900 hover:text-bg-panel"
        >
          {added ? (
            <>
              <Check className="h-4 w-4" /> Added
            </>
          ) : (
            "Add to cart"
          )}
        </button>
        <button
          type="button"
          onClick={() => handleAdd(true)}
          className="inline-flex items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-bg-panel transition hover:bg-ink-800"
        >
          Buy now
        </button>
      </div>
    </div>
  );
}
