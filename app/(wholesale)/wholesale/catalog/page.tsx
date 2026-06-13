"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { WholesaleGuard } from "@/components/store/WholesaleChrome";
import { useCart } from "@/lib/storeCart";
import { useWholesaleSession } from "@/lib/wholesaleSession";
import { STORE_PRODUCTS, productGradient, type StoreProduct } from "@/data/storeCatalog";
import { formatKrw, formatQty } from "@/lib/storeFormat";

function WholesaleRow({ product }: { product: StoreProduct }) {
  const { add } = useCart();
  const [qty, setQty] = useState(product.moq);
  const [added, setAdded] = useState(false);

  const belowMoq = qty < product.moq;

  function handleAdd() {
    if (belowMoq) return;
    add({ slug: product.slug, qty });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border py-4 sm:flex-row sm:items-center">
      <div
        className="h-16 w-16 shrink-0 rounded-lg border border-border"
        style={{ background: productGradient(product) }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink-900">{product.name}</div>
        <div className="text-xs text-ink-500">{product.nameKo} · {product.setSize}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400">Unit price</div>
          <div className="text-sm font-semibold text-ink-900">{formatKrw(product.wholesaleKrw)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400">MOQ</div>
          <div className="text-sm text-ink-700">{formatQty(product.moq)} ea</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-ink-400">Qty</div>
          <input
            type="number"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
            className="w-24 rounded-lg border border-border bg-bg-panel px-2.5 py-1.5 text-sm text-ink-900 outline-none focus:border-beige-400"
          />
          {belowMoq && (
            <div className="mt-0.5 text-[11px] text-status-danger">Min {formatQty(product.moq)}</div>
          )}
        </div>
        <button
          onClick={handleAdd}
          disabled={belowMoq}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-bg-panel transition hover:bg-ink-800 disabled:opacity-40"
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {added ? "Added" : "Add"}
        </button>
      </div>
    </div>
  );
}

function CatalogInner() {
  const { account } = useWholesaleSession();
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Wholesale catalog</h1>
          <p className="mt-1 text-sm text-ink-500">
            Member pricing for <span className="font-medium text-ink-700">{account?.company}</span>.
            Prices in KRW, excl. VAT. Minimum order quantities apply per item.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl2 border border-border bg-bg-panel p-2 shadow-card sm:p-5">
        {STORE_PRODUCTS.map((p) => (
          <WholesaleRow key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}

export default function WholesaleCatalogPage() {
  return (
    <WholesaleGuard>
      <CatalogInner />
    </WholesaleGuard>
  );
}
