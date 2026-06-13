import Link from "next/link";
import { productGradient, type StoreProduct } from "@/data/storeCatalog";
import { formatUsd } from "@/lib/storeFormat";

export default function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl2 border border-border bg-bg-panel shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div
        className="relative aspect-[4/3] w-full"
        style={{ background: productGradient(product) }}
      >
        {product.badge && (
          <span className="absolute left-3 top-3 rounded-full bg-ink-900/85 px-2.5 py-1 text-[11px] font-semibold text-bg-panel">
            {product.badge}
          </span>
        )}
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {product.colors.slice(0, 6).map((c) => (
            <span
              key={c.itemNo}
              className="h-3.5 w-3.5 rounded-full border border-white/60 shadow"
              style={{ background: c.hex }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[11px] uppercase tracking-wider text-ink-500">{product.setSize}</div>
        <h3 className="mt-1 text-sm font-semibold leading-snug text-ink-900 group-hover:underline">
          {product.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs text-ink-500">{product.tagline}</p>
        <div className="mt-3 text-base font-semibold text-ink-900">{formatUsd(product.retailUsd)}</div>
      </div>
    </Link>
  );
}
