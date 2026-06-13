import Link from "next/link";
import clsx from "clsx";
import ProductCard from "@/components/store/ProductCard";
import { STORE_PRODUCTS, PRODUCT_TYPE_LABELS } from "@/data/storeCatalog";
import type { ProductType } from "@/types";

const TYPES = Object.keys(PRODUCT_TYPE_LABELS) as ProductType[];

export default function ProductCatalogPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const activeType = TYPES.includes(searchParams.type as ProductType)
    ? (searchParams.type as ProductType)
    : undefined;

  const products = activeType
    ? STORE_PRODUCTS.filter((p) => p.productType === activeType)
    : STORE_PRODUCTS;

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-bg-subtle">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-beige-600">
              Another Day · Global Store
            </div>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-ink-900 md:text-5xl">
              Art materials you can <span className="italic">smell</span>.
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink-600">
              Small-batch oil pastels, watercolors and solid watercolors, each
              scented to its color story. Made in Korea, shipped worldwide.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#catalog"
                className="rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-bg-panel transition hover:bg-ink-800"
              >
                Shop the collection
              </Link>
              <Link
                href="/wholesale"
                className="rounded-full border border-border bg-bg-panel px-5 py-2.5 text-sm font-medium text-ink-800 transition hover:border-beige-400"
              >
                Wholesale inquiry
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Catalog */}
      <section id="catalog" className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip href="/product" active={!activeType} label="All" />
          {TYPES.map((t) => (
            <FilterChip
              key={t}
              href={`/product?type=${encodeURIComponent(t)}`}
              active={activeType === t}
              label={PRODUCT_TYPE_LABELS[t].en}
            />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={clsx(
        "rounded-full border px-4 py-1.5 text-sm font-medium transition",
        active
          ? "border-ink-900 bg-ink-900 text-bg-panel"
          : "border-border bg-bg-panel text-ink-700 hover:border-beige-400",
      )}
    >
      {label}
    </Link>
  );
}
