import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import AddToCart from "@/components/store/AddToCart";
import {
  STORE_PRODUCTS,
  getProduct,
  productGradient,
  PRODUCT_TYPE_LABELS,
} from "@/data/storeCatalog";
import { formatUsd } from "@/lib/storeFormat";

export function generateStaticParams() {
  return STORE_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = getProduct(params.slug);
  if (!product) notFound();

  const related = STORE_PRODUCTS.filter(
    (p) => p.productType === product.productType && p.slug !== product.slug,
  ).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-ink-500">
        <Link href="/product" className="hover:text-ink-900">Shop</Link>
        <ChevronRight className="h-3 w-3" />
        <Link
          href={`/product?type=${encodeURIComponent(product.productType)}`}
          className="hover:text-ink-900"
        >
          {PRODUCT_TYPE_LABELS[product.productType].en}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ink-700">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        {/* Visual */}
        <div>
          <div
            className="aspect-square w-full rounded-xl2 border border-border"
            style={{ background: productGradient(product) }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <div key={c.itemNo} className="flex items-center gap-1.5 rounded-full border border-border bg-bg-panel px-2.5 py-1">
                <span className="h-3 w-3 rounded-full" style={{ background: c.hex }} />
                <span className="text-[11px] text-ink-600">{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div>
          {product.badge && (
            <span className="inline-block rounded-full bg-beige-100 px-2.5 py-1 text-[11px] font-semibold text-beige-600">
              {product.badge}
            </span>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900 md:text-3xl">
            {product.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{product.nameKo}</p>
          <div className="mt-4 text-2xl font-semibold text-ink-900">
            {formatUsd(product.retailUsd)}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink-600">{product.description}</p>

          <ul className="mt-5 space-y-1.5">
            {product.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-ink-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-beige-400" />
                {h}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap gap-2 text-xs text-ink-600">
            <span className="rounded-full border border-border px-2.5 py-1">
              {product.setSize}
            </span>
            {product.scents.map((s) => (
              <span key={s} className="rounded-full border border-border px-2.5 py-1">
                Scent · {s}
              </span>
            ))}
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <AddToCart product={product} />
          </div>

          <p className="mt-4 text-xs text-ink-500">
            Worldwide shipping · 30-day returns ·{" "}
            <Link href="/wholesale" className="underline hover:text-ink-900">
              Buying in bulk? See wholesale
            </Link>
          </p>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-ink-900">You might also like</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/product/${p.slug}`}
                className="group overflow-hidden rounded-xl2 border border-border bg-bg-panel shadow-card transition hover:shadow-pop"
              >
                <div className="aspect-[4/3]" style={{ background: productGradient(p) }} />
                <div className="p-3">
                  <div className="text-xs font-medium text-ink-800 group-hover:underline">{p.name}</div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">{formatUsd(p.retailUsd)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
